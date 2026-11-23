-- Reversão da 020: volta às funções da 016/017/019 e remove restaurantes, destino do pedido, cache de rotas e os limites
-- 'gps'/'mapas'. Os pedidos não perdem nada além das colunas novas (restaurant_id, dest_*).
drop policy if exists orders_restaurant on public.orders;
drop policy if exists order_items_restaurant on public.order_items;
drop policy if exists deliveries_restaurant on public.deliveries;
drop policy if exists events_restaurant on public.order_events;

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
  -- destino aproximado (geocodificação só pelo CEP/região): raio maior, senão a entrega nunca fecha
  if d.dest_approx then v_raio := greatest(coalesce(v_raio, 50), 300); end if;
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

drop function if exists public.courier_set_eta(uuid, integer, real, text, text);
create or replace function public.courier_set_eta(p_delivery_id uuid, p_eta_minutes integer, p_distance_km real, p_polyline text)
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
         eta_updated_at = now()
   where d.id = p_delivery_id and d.courier_id = (select auth.uid()) and public.is_courier()
     and d.status in ('assigned', 'en_route', 'arriving', 'arrived');
end;
$$;

drop function if exists public.order_tracking(uuid);
create or replace function public.order_tracking(p_order_id uuid)
returns table (status text, lat double precision, lng double precision, dest_lat double precision, dest_lng double precision,
               eta_minutes smallint, distance_km real, route_polyline text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.status,
         case when d.last_captured_at > now() - interval '2 minutes' then round(d.last_lat::numeric, 3)::double precision end,
         case when d.last_captured_at > now() - interval '2 minutes' then round(d.last_lng::numeric, 3)::double precision end,
         d.dest_lat, d.dest_lng, d.eta_minutes, d.distance_km, d.route_polyline, d.last_captured_at
    from public.deliveries d
    join public.orders o on o.id = d.order_id
   where d.order_id = p_order_id
     and (o.user_id = (select auth.uid()) or public.is_admin());
$$;

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
    -- só registra a etapa na primeira vez (o GPS pode oscilar entre "chegando" e "no local")
    if v_tipo is not null and not exists (select 1 from public.order_events e where e.order_id = new.order_id and e.type = v_tipo) then
      insert into public.order_events (order_id, type) values (new.order_id, v_tipo);
      perform realtime.send(jsonb_build_object('status', new.status), 'status', 'pedido:' || new.order_id, true);
    end if;
  end if;
  if new.last_captured_at is distinct from old.last_captured_at or new.eta_updated_at is distinct from old.eta_updated_at
     or new.status is distinct from old.status then
    perform realtime.send(jsonb_strip_nulls(jsonb_build_object(
      'status', new.status,
      'lat', round(new.last_lat::numeric, 3), 'lng', round(new.last_lng::numeric, 3),
      'etaMinutos', new.eta_minutes, 'distanciaKm', round(new.distance_km::numeric, 1),
      'rota', case when new.route_polyline is distinct from old.route_polyline then new.route_polyline end,
      'atualizadoEm', new.last_captured_at)), 'rastreio', 'pedido:' || new.order_id, true);
  end if;
  return null;
end;
$$;
revoke all on function public.deliveries_broadcast() from public, anon, authenticated;
revoke all on function public.courier_set_eta(uuid, integer, real, text), public.order_tracking(uuid) from public, anon;
grant execute on function public.courier_set_eta(uuid, integer, real, text), public.order_tracking(uuid) to authenticated;

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
    else raise exception 'invalid_action' using errcode = '22023';
  end case;

  -- já bloqueado (qualquer uma das três chaves): recusa sem gravar de novo
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
  -- faxina ocasional: retenção de 7 dias
  if random() < 0.02 then delete from public.access_attempts where created_at < now() - interval '7 days'; end if;
  return true;
end;
$$;
revoke all on function public.access_check(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.access_check(text, text, text, uuid) to service_role;
delete from public.access_attempts where action in ('gps', 'mapas');
alter table public.access_attempts drop constraint if exists access_attempts_action_check;
alter table public.access_attempts add constraint access_attempts_action_check check (action in ('pedido', 'login_admin', 'codigo_2fa', 'rastreio_negado'));

drop table if exists public.route_cache;
drop function if exists public.order_set_destination(uuid, double precision, double precision, text);
alter table public.deliveries drop column if exists route_provider, drop column if exists last_speed_kmh;
alter table public.orders drop column if exists dest_lat, drop column if exists dest_lng, drop column if exists dest_source;
drop function if exists public.is_order_restaurant_member(uuid);
alter table public.orders drop column if exists restaurant_id;
drop table if exists public.restaurant_members;
drop table if exists public.restaurants;
drop function if exists public.is_order_restaurant_member(uuid);
drop function if exists public.is_restaurant_member(uuid);
drop function if exists public.default_restaurant();
