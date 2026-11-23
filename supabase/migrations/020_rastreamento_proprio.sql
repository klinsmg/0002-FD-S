-- 020: rastreamento self-hosted (mapa, rota e endereço na infraestrutura própria; sem Google obrigatório).
--   restaurants / restaurant_members : uma loja hoje (MDogão), estrutura pronta para "restaurante só vê os próprios pedidos"
--   orders.restaurant_id + destino    : ponto do endereço confirmado pelo cliente no checkout (pino ou Nominatim)
--   deliveries.route_provider         : quem calculou a rota/ETA (osrm | google | estimativa) e a velocidade do GPS
--   route_cache                       : cache de rotas (servidor, service_role) por origem/destino/modo/horário
--   access_check 'gps' e 'mapas'      : limite de envios do GPS e das chamadas de mapa/rota/endereço
-- Compatível com o código em produção: nenhuma assinatura usada por ele muda (só ganha parâmetros com default).
-- Reversão: supabase/rollback/020_down.sql

-- ---------- restaurantes ----------
create table if not exists public.restaurants (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 80),
  lat                 double precision check (lat between -90 and 90),
  lng                 double precision check (lng between -180 and 180),
  active              boolean not null default true,
  google_maps_enabled boolean not null default false,               -- Google como camada opcional (migração 021)
  plan                text not null default 'basico' check (plan in ('basico', 'premium')),
  google_maps_percent smallint not null default 100 check (google_maps_percent between 0 and 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
insert into public.restaurants (name) select 'MDogão Itapevi' where not exists (select 1 from public.restaurants);
drop trigger if exists restaurants_set_updated_at on public.restaurants;
create trigger restaurants_set_updated_at before update on public.restaurants for each row execute function public.set_updated_at();

create table if not exists public.restaurant_members (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index if not exists restaurant_members_user_idx on public.restaurant_members (user_id);

-- loja padrão dos pedidos (uma loja hoje)
create or replace function public.default_restaurant()
returns uuid language sql stable security definer set search_path = ''
as $$ select r.id from public.restaurants r where r.active order by r.created_at limit 1 $$;

create or replace function public.is_restaurant_member(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.restaurant_members m where m.restaurant_id = p_restaurant_id and m.user_id = (select auth.uid())) $$;

alter table public.orders add column if not exists restaurant_id uuid references public.restaurants (id) on delete set null;
alter table public.orders alter column restaurant_id set default public.default_restaurant();
update public.orders set restaurant_id = public.default_restaurant() where restaurant_id is null;
create index if not exists orders_restaurant_idx on public.orders (restaurant_id, created_at desc);

-- membro da equipe do restaurante DO PEDIDO (lê orders sem passar pelo RLS: evita recursão entre políticas)
create or replace function public.is_order_restaurant_member(p_order_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.orders o join public.restaurant_members m on m.restaurant_id = o.restaurant_id
                      where o.id = p_order_id and m.user_id = (select auth.uid())) $$;


-- ponto do endereço de entrega, confirmado pelo cliente (pino arrastado) ou sugerido pelo Nominatim
alter table public.orders add column if not exists dest_lat double precision check (dest_lat between -90 and 90);
alter table public.orders add column if not exists dest_lng double precision check (dest_lng between -180 and 180);
alter table public.orders add column if not exists dest_source text check (dest_source in ('pino', 'nominatim'));

alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
drop policy if exists restaurants_admin on public.restaurants;
drop policy if exists restaurants_member on public.restaurants;
drop policy if exists members_admin on public.restaurant_members;
drop policy if exists members_self on public.restaurant_members;
create policy restaurants_admin on public.restaurants for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy restaurants_member on public.restaurants for select to authenticated using ((select public.is_restaurant_member(id)));
create policy members_admin on public.restaurant_members for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy members_self on public.restaurant_members for select to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.restaurants, public.restaurant_members to authenticated;

-- equipe do restaurante vê os pedidos, itens, entregas e eventos DO PRÓPRIO restaurante (só leitura)
drop policy if exists orders_restaurant on public.orders;
create policy orders_restaurant on public.orders for select to authenticated using ((select public.is_restaurant_member(restaurant_id)));
drop policy if exists order_items_restaurant on public.order_items;
create policy order_items_restaurant on public.order_items for select to authenticated
  using ((select public.is_order_restaurant_member(order_id)));
drop policy if exists deliveries_restaurant on public.deliveries;
create policy deliveries_restaurant on public.deliveries for select to authenticated
  using ((select public.is_order_restaurant_member(order_id)));
drop policy if exists events_restaurant on public.order_events;
create policy events_restaurant on public.order_events for select to authenticated
  using ((select public.is_order_restaurant_member(order_id)));

-- O cliente grava o ponto do PRÓPRIO pedido de entrega, enquanto ele não saiu. Ponto a mais de 50 km da loja é recusado
-- (pino arrastado para outra cidade / valor forjado).
create or replace function public.order_set_destination(p_order_id uuid, p_lat double precision, p_lng double precision, p_source text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare o public.orders; r public.restaurants;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.user_id is distinct from (select auth.uid()) then return 'not_found'; end if;
  if o.order_type <> 'delivery' or o.status not in ('pending', 'confirmed', 'preparing', 'ready') then return 'locked'; end if;
  if p_source is null or p_source not in ('pino', 'nominatim') then return 'bad_source'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return 'bad_position'; end if;
  select * into r from public.restaurants where id = o.restaurant_id;
  if r.lat is not null and public.distance_m(r.lat, r.lng, p_lat, p_lng) > 50000 then return 'too_far'; end if;
  update public.orders set dest_lat = p_lat, dest_lng = p_lng, dest_source = p_source where id = o.id;
  return 'ok';
end;
$$;
revoke all on function public.order_set_destination(uuid, double precision, double precision, text) from public, anon;
grant execute on function public.order_set_destination(uuid, double precision, double precision, text) to authenticated;
revoke all on function public.default_restaurant(), public.is_restaurant_member(uuid), public.is_order_restaurant_member(uuid) from public, anon;
grant execute on function public.default_restaurant(), public.is_restaurant_member(uuid), public.is_order_restaurant_member(uuid) to authenticated;

-- ---------- rota / ETA ----------
alter table public.deliveries add column if not exists route_provider text check (route_provider in ('osrm', 'google', 'estimativa'));
alter table public.deliveries add column if not exists last_speed_kmh real;

-- velocidade do GPS guardada na entrega (ETA local entre recálculos); resto igual à 017
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
  v_vel real := case when p_speed_kmh between 0 and 250 then p_speed_kmh end;
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
  values (d.id, p_lat, p_lng, p_accuracy_m, v_vel, p_captured_at);

  select s.delivery_confirm_radius_m into v_raio from public.store_settings s limit 1;
  if d.dest_approx then v_raio := greatest(coalesce(v_raio, 50), 300); end if;
  v_dist := public.distance_m(p_lat, p_lng, d.dest_lat, d.dest_lng);
  update public.deliveries set
    last_lat = p_lat, last_lng = p_lng, last_accuracy_m = p_accuracy_m, last_captured_at = p_captured_at, last_speed_kmh = v_vel,
    started_at = coalesce(started_at, now()),
    status = case
      when v_dist <= coalesce(v_raio, 50) then 'arrived'
      when v_dist <= 500 then 'arriving'
      else 'en_route' end
  where id = d.id;
  return 'ok';
end;
$$;

-- Rota/ETA: agora informa o provedor e também pode ser gravada pelo admin (rota inicial loja -> cliente no despacho).
drop function if exists public.courier_set_eta(uuid, integer, real, text);
create or replace function public.courier_set_eta(p_delivery_id uuid, p_eta_minutes integer, p_distance_km real, p_polyline text,
  p_provider text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.deliveries d
     set eta_minutes = case when p_eta_minutes between 0 and 600 then p_eta_minutes end,
         distance_km = case when p_distance_km between 0 and 500 then p_distance_km end,
         route_polyline = case when char_length(p_polyline) <= 20000 then p_polyline end,
         route_provider = case when p_provider in ('osrm', 'google', 'estimativa') then p_provider end,
         eta_updated_at = now()
   where d.id = p_delivery_id
     and ((d.courier_id = (select auth.uid()) and public.is_courier()) or public.is_admin())
     and d.status in ('assigned', 'en_route', 'arriving', 'arrived');
end;
$$;
revoke all on function public.courier_set_eta(uuid, integer, real, text, text) from public, anon;
grant execute on function public.courier_set_eta(uuid, integer, real, text, text) to authenticated;

-- Rastreio do cliente: + loja (marcador), provedor da rota, hora do cálculo e velocidade (ETA local no navegador).
drop function if exists public.order_tracking(uuid);
create or replace function public.order_tracking(p_order_id uuid)
returns table (status text, lat double precision, lng double precision, dest_lat double precision, dest_lng double precision,
               eta_minutes smallint, distance_km real, route_polyline text, updated_at timestamptz,
               restaurant_lat double precision, restaurant_lng double precision, route_provider text, eta_updated_at timestamptz,
               speed_kmh real)
language sql
stable
security definer
set search_path = ''
as $$
  select d.status,
         case when d.last_captured_at > now() - interval '2 minutes' then round(d.last_lat::numeric, 3)::double precision end,
         case when d.last_captured_at > now() - interval '2 minutes' then round(d.last_lng::numeric, 3)::double precision end,
         d.dest_lat, d.dest_lng, d.eta_minutes, d.distance_km, d.route_polyline, d.last_captured_at,
         r.lat, r.lng, d.route_provider, d.eta_updated_at,
         case when d.last_captured_at > now() - interval '2 minutes' then d.last_speed_kmh end
    from public.deliveries d
    join public.orders o on o.id = d.order_id
    left join public.restaurants r on r.id = o.restaurant_id
   where d.order_id = p_order_id
     and d.status <> 'cancelled'
     and (o.user_id = (select auth.uid()) or public.is_admin() or public.is_restaurant_member(o.restaurant_id))
   order by d.created_at desc
   limit 1;
$$;
revoke all on function public.order_tracking(uuid) from public, anon;
grant execute on function public.order_tracking(uuid) to authenticated;

-- canal do pedido: + provedor da rota, hora do cálculo e velocidade
create or replace function public.deliveries_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_tipo text;
begin
  if new.status is distinct from old.status then
    v_tipo := case new.status when 'en_route' then 'EM_ROTA' when 'arriving' then 'CHEGANDO' when 'arrived' then 'CHEGOU_NO_LOCAL' end;
    if v_tipo is not null and not exists (select 1 from public.order_events e where e.order_id = new.order_id and e.type = v_tipo) then
      insert into public.order_events (order_id, type) values (new.order_id, v_tipo);
      perform realtime.send(jsonb_build_object('status', new.status), 'status', 'pedido:' || new.order_id, true);
    end if;
  end if;
  if new.last_captured_at is distinct from old.last_captured_at or new.eta_updated_at is distinct from old.eta_updated_at
     or new.status is distinct from old.status or new.route_polyline is distinct from old.route_polyline
     or new.route_provider is distinct from old.route_provider then
    perform realtime.send(jsonb_strip_nulls(jsonb_build_object(
      'status', new.status,
      'lat', round(new.last_lat::numeric, 3), 'lng', round(new.last_lng::numeric, 3),
      'etaMinutos', new.eta_minutes, 'distanciaKm', round(new.distance_km::numeric, 1),
      'rota', case when new.route_polyline is distinct from old.route_polyline then new.route_polyline end,
      'provedor', new.route_provider, 'etaEm', new.eta_updated_at, 'velocidadeKmh', round(new.last_speed_kmh::numeric),
      'atualizadoEm', new.last_captured_at)), 'rastreio', 'pedido:' || new.order_id, true);
  end if;
  return null;
end;
$$;
revoke all on function public.deliveries_broadcast() from public, anon, authenticated;

-- ---------- cache de rotas (só o servidor, com a chave secreta) ----------
create table if not exists public.route_cache (
  key         text primary key check (char_length(key) <= 200),
  provider    text not null check (provider in ('osrm', 'google')),
  polyline    text check (polyline is null or char_length(polyline) <= 20000),
  duration_s  integer not null check (duration_s >= 0),
  distance_m  integer not null check (distance_m >= 0),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists route_cache_expira_idx on public.route_cache (expires_at);
alter table public.route_cache enable row level security;  -- sem políticas: anon/authenticated não leem nem gravam
revoke all on public.route_cache from anon, authenticated;
grant select, insert, update, delete on public.route_cache to service_role;

-- ---------- limites: GPS e mapas ----------
alter table public.access_attempts drop constraint if exists access_attempts_action_check;
alter table public.access_attempts add constraint access_attempts_action_check
  check (action in ('pedido', 'login_admin', 'codigo_2fa', 'rastreio_negado', 'gps', 'mapas'));
create or replace function public.access_check(p_action text, p_ip text, p_device text, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := p_user;  -- informado pelo servidor (JWT já verificado); ninguém chama isto pela API
  v_ip text := nullif(left(btrim(coalesce(p_ip, '')), 64), '');
  v_dev uuid := case when p_device ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_device::uuid end;
  v_janela interval; v_bloqueio interval := interval '15 minutes';
  v_max_user int; v_max_dev int; v_max_ip int;
begin
  case p_action
    when 'pedido'      then v_janela := interval '10 minutes'; v_max_user := 6;  v_max_dev := 6;  v_max_ip := 20;
    when 'login_admin' then v_janela := interval '15 minutes'; v_max_user := 10; v_max_dev := 8;  v_max_ip := 15;
    when 'codigo_2fa'  then v_janela := interval '15 minutes'; v_max_user := 6;  v_max_dev := 6;  v_max_ip := 15;
    -- GPS a cada 15 s = 4/min; folga para a fila offline. Bloqueio curto para não cegar uma entrega em andamento.
    when 'gps'         then v_janela := interval '1 minute';   v_max_user := 20; v_max_dev := 20; v_max_ip := 60; v_bloqueio := interval '2 minutes';
    -- mapa/rota/endereço/atualizar previsão (cliente e painel)
    when 'mapas'       then v_janela := interval '10 minutes'; v_max_user := 40; v_max_dev := 40; v_max_ip := 120; v_bloqueio := interval '10 minutes';
    else raise exception 'invalid_action' using errcode = '22023';
  end case;

  if exists (select 1 from public.access_attempts a
              where a.action = p_action and a.blocked and a.created_at > now() - v_bloqueio
                and ((v_uid is not null and a.user_id = v_uid) or (v_dev is not null and a.device = v_dev) or (v_ip is not null and a.ip = v_ip))) then
    return false;
  end if;

  if (v_uid is not null and (select count(*) from public.access_attempts a where a.action = p_action and a.user_id = v_uid and a.created_at > now() - v_janela) >= v_max_user)
     or (v_dev is not null and (select count(*) from public.access_attempts a where a.action = p_action and a.device = v_dev and a.created_at > now() - v_janela) >= v_max_dev)
     or (v_ip is not null and (select count(*) from public.access_attempts a where a.action = p_action and a.ip = v_ip and a.created_at > now() - v_janela) >= v_max_ip) then
    insert into public.access_attempts (action, user_id, ip, device, blocked) values (p_action, v_uid, v_ip, v_dev, true);
    return false;
  end if;

  insert into public.access_attempts (action, user_id, ip, device) values (p_action, v_uid, v_ip, v_dev);
  if random() < 0.02 then delete from public.access_attempts where created_at < now() - interval '7 days'; end if;
  return true;
end;
$$;
revoke all on function public.access_check(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.access_check(text, text, text, uuid) to service_role;
