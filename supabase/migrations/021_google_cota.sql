-- 021: Google Maps Platform como camada OPCIONAL, com cota mensal rígida por SKU (custo ~zero dentro da cota grátis).
--   google_api_usage  : contador do mês por SKU (routes, map_load, map_tiles) com o teto (free_cap)
--   google_api_calls  : cada chamada de rota/mapa (Google, OSRM ou estimativa local) com latência e custo estimado
--   google_api_alerts : avisos de 70%, 85%, 95% e 100% do teto, um por SKU/mês
--   google_reserve    : reserva atômica de 1 evento ANTES de chamar o Google ('ok' | 'soft' | 'blocked')
--   google_consolidate: job diário (Vercel Cron) que reconcilia o contador com o registro de chamadas
-- Tudo só pelo servidor (service_role). O admin só LÊ (painel /admin/mapas).
-- Ciclo: mês do faturamento do Google (fuso America/Los_Angeles). Reversão: supabase/rollback/021_down.sql

create table if not exists public.google_api_usage (
  id            bigserial primary key,
  sku           text not null check (sku in ('routes', 'map_load', 'map_tiles')),
  period_start  date not null,
  period_end    date not null,
  used_events   integer not null default 0 check (used_events >= 0),
  free_cap      integer not null check (free_cap >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (sku, period_start)
);
drop trigger if exists google_api_usage_set_updated_at on public.google_api_usage;
create trigger google_api_usage_set_updated_at before update on public.google_api_usage for each row execute function public.set_updated_at();

create table if not exists public.google_api_calls (
  id             bigserial primary key,
  order_id       uuid references public.orders (id) on delete set null,
  delivery_id    uuid references public.deliveries (id) on delete set null,
  restaurant_id  uuid references public.restaurants (id) on delete set null,
  courier_id     uuid references auth.users (id) on delete set null,
  provider       text not null check (provider in ('google', 'osrm', 'estimativa', 'proprio')),
  sku            text check (sku is null or sku in ('routes', 'map_load', 'map_tiles')),
  endpoint       text not null check (char_length(endpoint) <= 60),
  status         text not null check (char_length(status) <= 60),
  latency_ms     integer check (latency_ms is null or latency_ms >= 0),
  cost_estimate  numeric(10, 4) not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists google_api_calls_created_idx on public.google_api_calls (created_at desc);
create index if not exists google_api_calls_sku_idx on public.google_api_calls (provider, sku, created_at);
create index if not exists google_api_calls_order_idx on public.google_api_calls (order_id);
create index if not exists google_api_calls_delivery_idx on public.google_api_calls (delivery_id);
create index if not exists google_api_calls_restaurant_idx on public.google_api_calls (restaurant_id);
create index if not exists google_api_calls_courier_idx on public.google_api_calls (courier_id);

create table if not exists public.google_api_alerts (
  sku           text not null,
  period_start  date not null,
  level         smallint not null check (level in (70, 85, 95, 100)),
  used_events   integer not null,
  free_cap      integer not null,
  created_at    timestamptz not null default now(),
  primary key (sku, period_start, level)
);

alter table public.google_api_usage enable row level security;
alter table public.google_api_calls enable row level security;
alter table public.google_api_alerts enable row level security;
drop policy if exists google_usage_admin on public.google_api_usage;
drop policy if exists google_calls_admin on public.google_api_calls;
drop policy if exists google_alerts_admin on public.google_api_alerts;
create policy google_usage_admin  on public.google_api_usage  for select to authenticated using ((select public.is_admin()));
create policy google_calls_admin  on public.google_api_calls  for select to authenticated using ((select public.is_admin()));
create policy google_alerts_admin on public.google_api_alerts for select to authenticated using ((select public.is_admin()));
revoke all on public.google_api_usage, public.google_api_calls, public.google_api_alerts from anon, authenticated;
grant select on public.google_api_usage, public.google_api_calls, public.google_api_alerts to authenticated;
grant select, insert, update, delete on public.google_api_usage, public.google_api_calls, public.google_api_alerts to service_role;
grant usage on sequence public.google_api_usage_id_seq, public.google_api_calls_id_seq to service_role;

-- início do ciclo de faturamento do Google (mês no fuso do Pacífico)
create or replace function public.google_period_start(p_at timestamptz default now())
returns date language sql stable set search_path = ''
as $$ select date_trunc('month', p_at at time zone 'America/Los_Angeles')::date $$;

-- avisos de consumo (70/85/95/100%), uma vez por SKU/mês
create or replace function public.google_alert(p_sku text, p_period date, p_used int, p_cap int)
returns void language plpgsql security definer set search_path = ''
as $$
declare v int;
begin
  if p_cap <= 0 then return; end if;
  foreach v in array array[70, 85, 95, 100] loop
    if p_used * 100 >= p_cap * v then
      insert into public.google_api_alerts (sku, period_start, level, used_events, free_cap)
      values (p_sku, p_period, v, p_used, p_cap) on conflict do nothing;
    end if;
  end loop;
end;
$$;

-- Reserva 1 evento do SKU antes de chamar o Google. Atômica (trava a linha do mês):
--   'blocked' : teto atingido -> nada de Google até o próximo ciclo
--   'soft'    : passou de p_soft_pct% do teto -> o chamador usa o OSRM (não consome)
--   'ok'      : consumiu 1 evento; pode chamar
create or replace function public.google_reserve(p_sku text, p_cap integer, p_soft_pct integer default 95)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ini date := public.google_period_start();
  u public.google_api_usage;
begin
  if p_sku not in ('routes', 'map_load', 'map_tiles') then raise exception 'invalid_sku' using errcode = '22023'; end if;
  if p_cap is null or p_cap <= 0 then return 'blocked'; end if;
  insert into public.google_api_usage (sku, period_start, period_end, free_cap)
  values (p_sku, v_ini, (v_ini + interval '1 month' - interval '1 day')::date, p_cap)
  on conflict (sku, period_start) do nothing;
  select * into u from public.google_api_usage where sku = p_sku and period_start = v_ini for update;
  -- o teto do mês acompanha a configuração (nunca acima do que já foi usado faz liberar o bloqueio por engano)
  if u.free_cap <> p_cap then update public.google_api_usage set free_cap = p_cap where id = u.id; u.free_cap := p_cap; end if;
  if u.used_events >= u.free_cap then perform public.google_alert(p_sku, v_ini, u.used_events, u.free_cap); return 'blocked'; end if;
  if u.used_events * 100 >= u.free_cap * greatest(least(coalesce(p_soft_pct, 95), 100), 1) then
    perform public.google_alert(p_sku, v_ini, u.used_events, u.free_cap); return 'soft';
  end if;
  update public.google_api_usage set used_events = used_events + 1 where id = u.id;
  perform public.google_alert(p_sku, v_ini, u.used_events + 1, u.free_cap);
  return 'ok';
end;
$$;

-- Job diário: o contador nunca fica ABAIXO do que o registro de chamadas mostra (chamada que escapou da reserva) e
-- faz a faxina (chamadas > 90 dias, cache vencido).
create or replace function public.google_consolidate()
returns table (sku text, used_events integer, free_cap integer, pct numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare v_ini date := public.google_period_start(); r record;
begin
  for r in
    select c.sku, count(*)::int n from public.google_api_calls c
     where c.provider = 'google' and c.sku is not null
       and c.created_at >= (v_ini::timestamp at time zone 'America/Los_Angeles')
     group by c.sku
  loop
    update public.google_api_usage g set used_events = greatest(g.used_events, r.n)
     where g.sku = r.sku and g.period_start = v_ini;
  end loop;
  for r in select g.sku, g.used_events, g.free_cap from public.google_api_usage g where g.period_start = v_ini loop
    perform public.google_alert(r.sku, v_ini, r.used_events, r.free_cap);
  end loop;
  delete from public.google_api_calls where created_at < now() - interval '90 days';
  delete from public.route_cache where expires_at < now();
  return query select g.sku, g.used_events, g.free_cap, round(g.used_events * 100.0 / nullif(g.free_cap, 0), 1)
                 from public.google_api_usage g where g.period_start = v_ini order by g.sku;
end;
$$;

revoke all on function public.google_period_start(timestamptz), public.google_alert(text, date, int, int),
  public.google_reserve(text, integer, integer), public.google_consolidate() from public, anon, authenticated;
grant execute on function public.google_period_start(timestamptz), public.google_reserve(text, integer, integer),
  public.google_consolidate() to service_role;
