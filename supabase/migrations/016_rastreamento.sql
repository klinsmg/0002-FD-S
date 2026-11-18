-- 016: rastreamento ao vivo para o cliente (bloco 12). Reaproveita o canal privado pedido:<id> da migration 013.
--   evento 'rastreio' : posição APROXIMADA (3 casas decimais, ~100 m), status da entrega, ETA, distância e rota.
--   evento 'status'   : mudança de etapa da entrega (a caminho, chegando, no local) -> a página redesenha a linha do tempo.
-- O cliente nunca lê deliveries/delivery_positions direto: só order_tracking (dono do pedido) e o canal.

-- ETA/rota calculadas no servidor (Routes API com a chave de backend) e gravadas aqui pelo entregador da entrega.
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

-- O que o cliente pode saber do próprio pedido. Posição só se recente (até 2 min) e arredondada.
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

-- Publica no canal do pedido a cada posição/ETA nova e registra as etapas da entrega na linha do tempo.
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
drop trigger if exists deliveries_broadcast on public.deliveries;
create trigger deliveries_broadcast after update on public.deliveries for each row execute function public.deliveries_broadcast();

revoke all on function public.courier_set_eta(uuid, integer, real, text), public.order_tracking(uuid) from public, anon;
grant execute on function public.courier_set_eta(uuid, integer, real, text), public.order_tracking(uuid) to authenticated;
