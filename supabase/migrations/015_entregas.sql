-- 015: entregadores, entregas, posições de GPS, eventos do pedido e confirmação de entrega (blocos 11 e 12).
-- Fluxo:
--   loja: Pronto -> "Saiu para entrega" escolhendo o entregador (dispatch_order) -> entrega 'assigned'
--   entregador (/entregador, logado com Google e liberado pelo admin): envia GPS (courier_report_position)
--   entregador: "Entregue" (courier_confirm_delivery) -> só dentro do raio (padrão 50 m) do endereço, com GPS preciso
--     (<= 30 m) e posição recente. A distância é recalculada AQUI, com a última posição válida gravada; o app não decide.
-- LGPD: posição só é aceita com entrega ativa; histórico de posições apagado 30 dias após a entrega (purge_delivery_positions);
--   o cliente nunca lê posições: recebe só posição aproximada, status e ETA (migration 016).

-- ---------- configuração ----------
alter table public.store_settings
  add column if not exists delivery_confirm_radius_m smallint not null default 50 check (delivery_confirm_radius_m between 20 and 300),
  add column if not exists gps_max_accuracy_m smallint not null default 30 check (gps_max_accuracy_m between 10 and 100);
comment on column public.store_settings.delivery_confirm_radius_m is 'Raio (m) em volta do endereço em que o entregador pode confirmar a entrega.';
comment on column public.store_settings.gps_max_accuracy_m is 'Precisão máxima aceita (m) do GPS na hora de confirmar a entrega.';

-- ---------- entregadores ----------
create table public.couriers (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.couriers is 'Quem pode usar o app do entregador. Gerido pelo admin (admin_set_courier).';

create or replace function public.is_courier()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.couriers c where c.user_id = (select auth.uid()) and c.active);
$$;

-- ---------- entregas ----------
create table public.deliveries (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null unique references public.orders (id) on delete cascade,
  courier_id          uuid references auth.users (id) on delete set null,
  status              text not null default 'assigned' check (status in ('assigned', 'en_route', 'arriving', 'arrived', 'delivered', 'failed', 'cancelled')),
  dest_lat            double precision not null check (dest_lat between -90 and 90),
  dest_lng            double precision not null check (dest_lng between -180 and 180),
  last_lat            double precision,
  last_lng            double precision,
  last_accuracy_m     real,
  last_captured_at    timestamptz,
  eta_minutes         smallint,
  distance_km         real,
  route_polyline      text check (route_polyline is null or char_length(route_polyline) <= 20000),
  eta_updated_at      timestamptz,
  started_at          timestamptz,
  finished_at         timestamptz,
  confirm_lat         double precision,
  confirm_lng         double precision,
  confirm_accuracy_m  real,
  confirm_distance_m  real,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index deliveries_courier_idx on public.deliveries (courier_id, status);
comment on table public.deliveries is 'Uma entrega por pedido de entrega. confirm_* = auditoria da confirmação (posição, precisão e distância no momento).';

create table public.delivery_positions (
  id            bigserial primary key,
  delivery_id   uuid not null references public.deliveries (id) on delete cascade,
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    real not null,
  speed_kmh     real,
  captured_at   timestamptz not null,
  received_at   timestamptz not null default now()
);
create index delivery_positions_delivery_idx on public.delivery_positions (delivery_id, captured_at desc);
comment on table public.delivery_positions is 'Histórico de GPS das entregas (auditoria e trajeto). Apagado 30 dias após a entrega.';

create table public.order_events (
  id          bigserial primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  type        text not null check (type in ('PEDIDO_CRIADO', 'PEDIDO_CONFIRMADO', 'EM_PREPARO', 'PRONTO_PARA_RETIRADA', 'PRONTO',
                'ENTREGADOR_ATRIBUIDO', 'SAIU_PARA_ENTREGA', 'EM_ROTA', 'CHEGANDO', 'CHEGOU_NO_LOCAL', 'ENTREGUE', 'RETIRADO', 'CANCELADO', 'FALHA_NA_ENTREGA')),
  data        jsonb,
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);
comment on table public.order_events is 'Linha do tempo do pedido (auditoria). Gravada só por gatilhos e funções.';

create trigger deliveries_set_updated_at before update on public.deliveries for each row execute function public.set_updated_at();

-- ---------- acesso ----------
revoke all on public.couriers, public.deliveries, public.delivery_positions, public.order_events from anon, authenticated;
grant select on public.couriers, public.deliveries, public.delivery_positions, public.order_events to authenticated;
alter table public.couriers           enable row level security;
alter table public.deliveries         enable row level security;
alter table public.delivery_positions enable row level security;
alter table public.order_events       enable row level security;
create policy couriers_admin        on public.couriers           for select to authenticated using ((select public.is_admin()));
create policy couriers_self         on public.couriers           for select to authenticated using (user_id = (select auth.uid()));
create policy deliveries_admin      on public.deliveries         for select to authenticated using ((select public.is_admin()));
create policy deliveries_courier    on public.deliveries         for select to authenticated using (courier_id = (select auth.uid()) and (select public.is_courier()));
create policy positions_admin       on public.delivery_positions for select to authenticated using ((select public.is_admin()));
create policy events_admin          on public.order_events       for select to authenticated using ((select public.is_admin()));
create policy events_owner          on public.order_events       for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_events.order_id and o.user_id = (select auth.uid())));
-- entregador lê o pedido (itens, nome, telefone, endereço) só das entregas dele
create policy orders_courier on public.orders for select to authenticated
  using (exists (select 1 from public.deliveries d where d.order_id = orders.id and d.courier_id = (select auth.uid())) and (select public.is_courier()));
create policy order_items_courier on public.order_items for select to authenticated
  using (exists (select 1 from public.deliveries d where d.order_id = order_items.order_id and d.courier_id = (select auth.uid())) and (select public.is_courier()));

-- ---------- linha do tempo automática ----------
create or replace function public.orders_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_tipo text;
begin
  if tg_op = 'INSERT' then
    v_tipo := 'PEDIDO_CRIADO';
  elsif new.status is distinct from old.status then
    v_tipo := case new.status
      when 'confirmed' then 'PEDIDO_CONFIRMADO'
      when 'preparing' then 'EM_PREPARO'
      when 'ready' then case when new.order_type = 'delivery' then 'PRONTO' else 'PRONTO_PARA_RETIRADA' end
      when 'out_for_delivery' then 'SAIU_PARA_ENTREGA'
      when 'delivered' then case when new.order_type = 'delivery' then 'ENTREGUE' else 'RETIRADO' end
      when 'cancelled' then 'CANCELADO'
    end;
  end if;
  if v_tipo is not null then insert into public.order_events (order_id, type) values (new.id, v_tipo); end if;
  return null;
end;
$$;
revoke all on function public.orders_log_event() from public, anon, authenticated;
create trigger orders_log_event after insert or update of status on public.orders for each row execute function public.orders_log_event();

-- pedido cancelado com entrega em andamento: encerra a entrega
create or replace function public.orders_cancel_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.deliveries set status = 'cancelled', finished_at = now()
     where order_id = new.id and status not in ('delivered', 'failed', 'cancelled');
  end if;
  return null;
end;
$$;
revoke all on function public.orders_cancel_delivery() from public, anon, authenticated;
create trigger orders_cancel_delivery after update of status on public.orders for each row execute function public.orders_cancel_delivery();

-- ---------- admin ----------
-- Libera (ou tira) alguém como entregador pelo e-mail da conta. Nunca mexe em admin.
create or replace function public.admin_set_courier(p_email text, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_id is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  insert into public.couriers (user_id, active) values (v_id, p_active)
  on conflict (user_id) do update set active = excluded.active;
  return v_id;
end;
$$;

-- Lista de entregadores com nome e e-mail (para o painel e para escolher no "Saiu para entrega").
create or replace function public.admin_list_couriers()
returns table (user_id uuid, name text, email text, active boolean, open_deliveries bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id, p.full_name, u.email::text, c.active,
         (select count(*) from public.deliveries d where d.courier_id = c.user_id and d.status in ('assigned', 'en_route', 'arriving', 'arrived'))
    from public.couriers c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
   where public.is_admin()
   order by c.active desc, p.full_name nulls last;
$$;

-- "Saiu para entrega" escolhendo o entregador. As coordenadas do destino vêm do servidor (geocodificação com a chave
-- de backend). Só pedido de ENTREGA em "Pronto", para entregador ativo.
create or replace function public.dispatch_order(p_order_id uuid, p_courier_id uuid, p_dest_lat double precision, p_dest_lng double precision)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.couriers c where c.user_id = p_courier_id and c.active) then
    raise exception 'courier_not_found' using errcode = 'P0002';
  end if;
  if p_dest_lat is null or p_dest_lng is null or p_dest_lat not between -90 and 90 or p_dest_lng not between -180 and 180 then
    raise exception 'invalid_destination' using errcode = '22023';
  end if;
  update public.orders set status = 'out_for_delivery'
   where id = p_order_id and status = 'ready' and order_type = 'delivery';
  if not found then raise exception 'order_not_ready' using errcode = 'P0002'; end if;
  insert into public.deliveries (order_id, courier_id, dest_lat, dest_lng) values (p_order_id, p_courier_id, p_dest_lat, p_dest_lng)
  returning id into v_id;
  insert into public.order_events (order_id, type, data) values (p_order_id, 'ENTREGADOR_ATRIBUIDO', null);
  return v_id;
end;
$$;

-- ---------- entregador ----------
-- distância em metros (haversine)
create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- Recebe uma posição de GPS. Descarta (com motivo) o que não for coerente. Devolve o motivo ou 'ok'.
--   not_assigned  : não é o entregador da entrega / entrega encerrada / não é entregador ativo
--   stale/future  : capturada há mais de 2 min ou no futuro (relógio do aparelho)
--   duplicate/old : mesma hora ou mais antiga que a última aceita
--   too_fast      : menos de 3 s depois da última (limite de envio)
--   jump          : salto impossível (> 160 km/h desde a última posição, com folga da precisão)
--   bad_accuracy  : precisão inválida (<= 0 ou > 5 km)
create or replace function public.courier_report_position(p_delivery_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy_m real, p_speed_kmh real, p_captured_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.deliveries;
  v_seg double precision;
  v_dist double precision;
  v_raio int;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null or d.courier_id is distinct from (select auth.uid()) or not public.is_courier()
     or d.status not in ('assigned', 'en_route', 'arriving', 'arrived') then
    return 'not_assigned';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return 'bad_position'; end if;
  if p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > 5000 then return 'bad_accuracy'; end if;
  if p_captured_at is null or p_captured_at < now() - interval '2 minutes' then return 'stale'; end if;
  if p_captured_at > now() + interval '30 seconds' then return 'future'; end if;
  if d.last_captured_at is not null then
    if p_captured_at <= d.last_captured_at then return 'duplicate'; end if;
    v_seg := extract(epoch from (p_captured_at - d.last_captured_at));
    if v_seg < 3 then return 'too_fast'; end if;
    v_dist := public.distance_m(d.last_lat, d.last_lng, p_lat, p_lng);
    if greatest(v_dist - p_accuracy_m - coalesce(d.last_accuracy_m, 0), 0) / v_seg * 3.6 > 160 then return 'jump'; end if;
  end if;

  insert into public.delivery_positions (delivery_id, lat, lng, accuracy_m, speed_kmh, captured_at)
  values (d.id, p_lat, p_lng, p_accuracy_m, case when p_speed_kmh between 0 and 250 then p_speed_kmh end, p_captured_at);

  select s.delivery_confirm_radius_m into v_raio from public.store_settings s limit 1;
  v_dist := public.distance_m(p_lat, p_lng, d.dest_lat, d.dest_lng);
  update public.deliveries set
    last_lat = p_lat, last_lng = p_lng, last_accuracy_m = p_accuracy_m, last_captured_at = p_captured_at,
    started_at = coalesce(started_at, now()),
    status = case
      when v_dist <= coalesce(v_raio, 50) then 'arrived'
      when v_dist <= 500 then 'arriving'
      else 'en_route' end
  where id = d.id;
  return 'ok';
end;
$$;

-- "Entregue": recalcula a distância com a última posição VÁLIDA gravada (não com o que o app diz agora).
create or replace function public.courier_confirm_delivery(p_delivery_id uuid)
returns table (result text, distance_m double precision, accuracy_m real, radius_m int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.deliveries;
  v_raio int; v_prec int; v_dist double precision;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null or d.courier_id is distinct from (select auth.uid()) or not public.is_courier()
     or d.status not in ('assigned', 'en_route', 'arriving', 'arrived') then
    return query select 'not_assigned'::text, null::double precision, null::real, null::int; return;
  end if;
  select s.delivery_confirm_radius_m, s.gps_max_accuracy_m into v_raio, v_prec from public.store_settings s limit 1;
  v_raio := coalesce(v_raio, 50); v_prec := coalesce(v_prec, 30);
  if d.last_captured_at is null or d.last_captured_at < now() - interval '60 seconds' then
    return query select 'no_recent_position'::text, null::double precision, d.last_accuracy_m, v_raio; return;
  end if;
  v_dist := public.distance_m(d.last_lat, d.last_lng, d.dest_lat, d.dest_lng);
  if d.last_accuracy_m > v_prec then
    return query select 'low_accuracy'::text, v_dist, d.last_accuracy_m, v_raio; return;
  end if;
  if v_dist > v_raio then
    return query select 'too_far'::text, v_dist, d.last_accuracy_m, v_raio; return;
  end if;

  update public.deliveries set status = 'delivered', finished_at = now(),
    confirm_lat = d.last_lat, confirm_lng = d.last_lng, confirm_accuracy_m = d.last_accuracy_m, confirm_distance_m = v_dist
  where id = d.id;
  -- único caminho para "Entregue" em pedido de entrega (o gatilho 012 só trava a API; aqui é security definer)
  update public.orders set status = 'delivered' where id = d.order_id and status = 'out_for_delivery';
  update public.order_events set data = jsonb_build_object('distancia_m', round(v_dist::numeric, 1), 'precisao_m', d.last_accuracy_m)
   where id = (select max(e.id) from public.order_events e where e.order_id = d.order_id and e.type = 'ENTREGUE');
  return query select 'delivered'::text, v_dist, d.last_accuracy_m, v_raio;
end;
$$;

-- Retenção (LGPD): posições de entregas encerradas há mais de 30 dias. Chamada pelo painel/cron.
create or replace function public.purge_delivery_positions()
returns bigint
language sql
security definer
set search_path = ''
as $$
  with x as (
    delete from public.delivery_positions p using public.deliveries d
     where p.delivery_id = d.id and d.finished_at < now() - interval '30 days' and public.is_admin()
    returning 1)
  select count(*) from x;
$$;

-- tentativas negadas no rastreio entram no registro de segurança (migration 014)
alter table public.access_attempts drop constraint if exists access_attempts_action_check;
alter table public.access_attempts add constraint access_attempts_action_check check (action in ('pedido', 'login_admin', 'codigo_2fa', 'rastreio_negado'));

create or replace function public.log_denied(p_ip text, p_device text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.access_attempts (action, user_id, ip, device, blocked)
  values ('rastreio_negado', (select auth.uid()), nullif(left(btrim(coalesce(p_ip, '')), 64), ''),
          case when p_device ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_device::uuid end, true);
$$;

revoke all on function public.is_courier(), public.admin_set_courier(text, boolean), public.admin_list_couriers(),
  public.dispatch_order(uuid, uuid, double precision, double precision), public.distance_m(double precision, double precision, double precision, double precision),
  public.courier_report_position(uuid, double precision, double precision, real, real, timestamptz), public.courier_confirm_delivery(uuid),
  public.purge_delivery_positions(), public.log_denied(text, text) from public, anon;
grant execute on function public.is_courier(), public.admin_set_courier(text, boolean), public.admin_list_couriers(),
  public.dispatch_order(uuid, uuid, double precision, double precision),
  public.courier_report_position(uuid, double precision, double precision, real, real, timestamptz), public.courier_confirm_delivery(uuid),
  public.purge_delivery_positions(), public.log_denied(text, text) to authenticated;

-- "Saiu para entrega" agora só pelo dispatch_order (que cria a entrega com entregador e destino): a API não pula direto.
create or replace function public.order_status_ok(p_de public.order_status, p_para public.order_status, p_tipo text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_de = p_para
      or (p_para = 'cancelled' and p_de not in ('delivered', 'cancelled'))
      or (p_de in ('pending', 'confirmed') and p_para = 'preparing')
      or (p_de = 'preparing' and p_para = 'ready')
      or (p_de = 'ready' and p_tipo <> 'delivery' and p_para = 'delivered');
$$;
