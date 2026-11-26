-- 022: remove o RASTREAMENTO (GPS, rotas/mapas, cota do Google, restaurantes) e mantém a ENTREGA com entregador:
--   Novo -> Em preparo -> Pronto -> Saiu para entrega (a loja direciona a um entregador) -> Entregue (o entregador dá baixa)
--   Cancelado vale em qualquer etapa aberta. O entregador também pode recusar ou devolver (o pedido volta para Pronto).
-- Fica: entregadores (couriers), entregas (deliveries, sem posição/rota), linha do tempo de status, tempo real e limites.
-- Volta atrás: restaurar supabase/backups/20261126-180247-pre022-{schema,data}.sql (não há down: os dados de GPS somem).

-- 1) políticas, gatilhos e tabelas do rastreamento
drop policy if exists orders_restaurant on public.orders;
drop policy if exists order_items_restaurant on public.order_items;
drop policy if exists events_restaurant on public.order_events;
drop policy if exists deliveries_restaurant on public.deliveries;
drop trigger if exists deliveries_broadcast on public.deliveries;

drop table if exists public.google_api_alerts;
drop table if exists public.google_api_calls;
drop table if exists public.google_api_usage;
drop table if exists public.route_cache;
drop table if exists public.delivery_positions;
alter table public.orders drop column if exists restaurant_id;
alter table public.orders drop column if exists dest_lat;
alter table public.orders drop column if exists dest_lng;
alter table public.orders drop column if exists dest_source;
drop table if exists public.restaurant_members;
drop table if exists public.restaurants;
alter table public.store_settings drop column if exists delivery_confirm_radius_m;
alter table public.store_settings drop column if exists gps_max_accuracy_m;

-- 2) entrega sem rastreamento: só quem leva e a situação (com o entregador / entregue / não entregue / cancelada)
drop index if exists public.deliveries_uma_ativa;
update public.deliveries set status = 'assigned' where status in ('en_route', 'arriving', 'arrived');
alter table public.deliveries drop constraint if exists deliveries_status_check;
alter table public.deliveries add constraint deliveries_status_check check (status in ('assigned', 'delivered', 'failed', 'cancelled'));
create unique index deliveries_uma_ativa on public.deliveries (order_id) where status = 'assigned';
alter table public.deliveries
  drop column if exists dest_lat, drop column if exists dest_lng, drop column if exists dest_approx,
  drop column if exists last_lat, drop column if exists last_lng, drop column if exists last_accuracy_m,
  drop column if exists last_captured_at, drop column if exists last_speed_kmh, drop column if exists eta_minutes,
  drop column if exists distance_km, drop column if exists route_polyline, drop column if exists route_provider,
  drop column if exists eta_updated_at, drop column if exists started_at, drop column if exists confirm_lat,
  drop column if exists confirm_lng, drop column if exists confirm_accuracy_m, drop column if exists confirm_distance_m;
comment on table public.deliveries is 'Uma entrega ativa por pedido: quem leva (courier_id) e a situação. Sem posição nem rota.';

-- 3) funções do rastreamento
drop function if exists public.deliveries_broadcast();
drop function if exists public.dispatch_order(uuid, uuid, double precision, double precision);
drop function if exists public.dispatch_order(uuid, uuid, double precision, double precision, boolean);
drop function if exists public.courier_report_position(uuid, double precision, double precision, real, real, timestamptz);
drop function if exists public.courier_confirm_delivery(uuid);
drop function if exists public.courier_set_eta(uuid, integer, real, text);
drop function if exists public.courier_set_eta(uuid, integer, real, text, text);
drop function if exists public.order_tracking(uuid);
drop function if exists public.order_set_destination(uuid, double precision, double precision, text);
drop function if exists public.purge_delivery_positions();
drop function if exists public.distance_m(double precision, double precision, double precision, double precision);
drop function if exists public.is_order_restaurant_member(uuid);
drop function if exists public.is_restaurant_member(uuid);
drop function if exists public.default_restaurant();
drop function if exists public.google_reserve(text, integer, integer);
drop function if exists public.google_alert(text, date, int, int);
drop function if exists public.google_consolidate();
drop function if exists public.google_period_start(timestamptz);
drop function if exists public.log_denied(text, text, uuid);
drop function if exists public.log_denied(text, text);

-- 4) "Saiu para entrega": a loja escolhe o entregador (só admin; pedido de entrega Pronto; entregador ativo)
create or replace function public.dispatch_order(p_order_id uuid, p_courier_id uuid)
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
  update public.orders set status = 'out_for_delivery'
   where id = p_order_id and status = 'ready' and order_type = 'delivery';
  if not found then raise exception 'order_not_ready' using errcode = 'P0002'; end if;
  insert into public.deliveries (order_id, courier_id) values (p_order_id, p_courier_id) returning id into v_id;
  insert into public.order_events (order_id, type) values (p_order_id, 'ENTREGADOR_ATRIBUIDO');
  return v_id;
end;
$$;

-- 5) baixa da entrega: só o entregador da entrega, ativo, com a entrega em andamento
create or replace function public.courier_confirm_delivery(p_delivery_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare d public.deliveries;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null or d.courier_id is distinct from (select auth.uid()) or not public.is_courier() or d.status <> 'assigned' then
    return 'not_assigned';
  end if;
  update public.deliveries set status = 'delivered', finished_at = now() where id = d.id;
  -- único caminho para "Entregue" em pedido de entrega (o gatilho de fluxo trava a API; aqui é security definer)
  update public.orders set status = 'delivered' where id = d.order_id and status = 'out_for_delivery';
  return 'delivered';
end;
$$;

-- 6) recusar / não conseguir entregar: a entrega encerra e o pedido volta para Pronto
create or replace function public.courier_return_delivery(p_delivery_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare d public.deliveries;
begin
  if p_motivo not in ('recusada', 'cliente_ausente', 'endereco_nao_encontrado', 'outro') then return 'invalid_reason'; end if;
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null or d.courier_id is distinct from (select auth.uid()) or not public.is_courier() or d.status <> 'assigned' then
    return 'not_assigned';
  end if;
  update public.deliveries set status = case when p_motivo = 'recusada' then 'cancelled' else 'failed' end, finished_at = now()
   where id = d.id;
  update public.orders set status = 'ready' where id = d.order_id and status = 'out_for_delivery';
  insert into public.order_events (order_id, type, data)
  values (d.order_id, case when p_motivo = 'recusada' then 'ENTREGA_RECUSADA' else 'FALHA_NA_ENTREGA' end, jsonb_build_object('motivo', p_motivo));
  return 'ok';
end;
$$;

-- 7) lista de entregadores do painel (entregas em andamento = 'assigned')
create or replace function public.admin_list_couriers()
returns table (user_id uuid, name text, email text, active boolean, open_deliveries bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id, p.full_name, u.email::text, c.active,
         (select count(*) from public.deliveries d where d.courier_id = c.user_id and d.status = 'assigned')
    from public.couriers c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
   where public.is_admin()
   order by c.active desc, p.full_name nulls last;
$$;

revoke all on function public.dispatch_order(uuid, uuid), public.courier_confirm_delivery(uuid),
  public.courier_return_delivery(uuid, text), public.admin_list_couriers() from public, anon;
grant execute on function public.dispatch_order(uuid, uuid), public.courier_confirm_delivery(uuid),
  public.courier_return_delivery(uuid, text), public.admin_list_couriers() to authenticated;

-- 8) linha do tempo: sem as etapas de rota (a caminho, chegando, no local)
delete from public.order_events where type in ('EM_ROTA', 'CHEGANDO', 'CHEGOU_NO_LOCAL');
update public.order_events set data = null where type = 'ENTREGUE';
alter table public.order_events drop constraint if exists order_events_type_check;
alter table public.order_events add constraint order_events_type_check check (type in (
  'PEDIDO_CRIADO', 'PEDIDO_CONFIRMADO', 'EM_PREPARO', 'PRONTO_PARA_RETIRADA', 'PRONTO', 'ENTREGADOR_ATRIBUIDO',
  'SAIU_PARA_ENTREGA', 'ENTREGUE', 'RETIRADO', 'CANCELADO', 'FALHA_NA_ENTREGA', 'ENTREGA_RECUSADA'));

-- 9) limites de acesso: só as ações que existem
delete from public.access_attempts where action in ('rastreio_negado', 'gps', 'mapas');
alter table public.access_attempts drop constraint if exists access_attempts_action_check;
alter table public.access_attempts add constraint access_attempts_action_check check (action in ('pedido', 'login_admin', 'codigo_2fa'));
