-- 017 (Fase 1, bug): destino geocodificado de forma aproximada (só CEP/região) deixava a entrega impossível de confirmar
-- (o entregador nunca ficava a 50 m de um ponto que pode estar a centenas de metros da casa) e o pedido travava.
-- Agora o despacho informa se o destino é aproximado e, nesse caso, o raio de confirmação passa a ser de no mínimo 300 m.
-- A auditoria do evento ENTREGUE registra o raio usado e se o destino era aproximado.
-- Reversão: supabase/rollback/017_down.sql

alter table public.deliveries add column if not exists dest_approx boolean not null default false;
comment on column public.deliveries.dest_approx is 'true = endereço localizado só de forma aproximada (CEP/região): confirmação aceita em até 300 m.';

drop function if exists public.dispatch_order(uuid, uuid, double precision, double precision);
create or replace function public.dispatch_order(p_order_id uuid, p_courier_id uuid, p_dest_lat double precision, p_dest_lng double precision,
  p_dest_approx boolean default false)
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
  insert into public.deliveries (order_id, courier_id, dest_lat, dest_lng, dest_approx)
  values (p_order_id, p_courier_id, p_dest_lat, p_dest_lng, coalesce(p_dest_approx, false))
  returning id into v_id;
  insert into public.order_events (order_id, type, data) values (p_order_id, 'ENTREGADOR_ATRIBUIDO', null);
  return v_id;
end;
$$;
revoke all on function public.dispatch_order(uuid, uuid, double precision, double precision, boolean) from public, anon;
grant execute on function public.dispatch_order(uuid, uuid, double precision, double precision, boolean) to authenticated;

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
  if d.dest_approx then v_raio := greatest(v_raio, 300); end if;
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
  update public.order_events set data = jsonb_build_object('distancia_m', round(v_dist::numeric, 1), 'precisao_m', d.last_accuracy_m, 'raio_m', v_raio, 'destino_aproximado', d.dest_approx)
   where id = (select max(e.id) from public.order_events e where e.order_id = d.order_id and e.type = 'ENTREGUE');
  return query select 'delivered'::text, v_dist, d.last_accuracy_m, v_raio;
end;
$$;

