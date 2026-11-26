-- 022: remove o rastreamento de entregas (app do entregador, GPS, rotas/mapas, cota do Google, restaurantes) e volta
-- ao fluxo só de status, operado pela loja: Novo -> Em preparo -> Pronto -> Saiu para entrega -> Entregue (ou Cancelado).
-- Fica: pedidos, status, linha do tempo de status (order_events), tempo real dos pedidos e limites.
-- Volta atrás: restaurar supabase/backups/20261126-180247-pre022-{schema,data}.sql (não há down: os dados de GPS somem).

-- 1) fluxo de status: a loja volta a marcar "Saiu para entrega" e "Entregue" direto
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
      or (p_de = 'ready' and p_tipo = 'delivery' and p_para = 'out_for_delivery')
      or (p_de = 'out_for_delivery' and p_para = 'delivered')
      or (p_de = 'ready' and p_tipo <> 'delivery' and p_para = 'delivered');
$$;

-- 2) gatilhos e políticas que dependem das entregas/entregadores/restaurantes
drop trigger if exists orders_cancel_delivery on public.orders;
drop policy if exists orders_courier on public.orders;
drop policy if exists order_items_courier on public.order_items;
drop policy if exists orders_restaurant on public.orders;
drop policy if exists order_items_restaurant on public.order_items;
drop policy if exists events_restaurant on public.order_events;

-- 3) tabelas (com seus gatilhos, índices e políticas)
drop table if exists public.google_api_alerts;
drop table if exists public.google_api_calls;
drop table if exists public.google_api_usage;
drop table if exists public.route_cache;
drop table if exists public.delivery_positions;
drop table if exists public.deliveries;
drop table if exists public.couriers;
alter table public.orders drop column if exists restaurant_id;
alter table public.orders drop column if exists dest_lat;
alter table public.orders drop column if exists dest_lng;
alter table public.orders drop column if exists dest_source;
drop table if exists public.restaurant_members;
drop table if exists public.restaurants;
alter table public.store_settings drop column if exists delivery_confirm_radius_m;
alter table public.store_settings drop column if exists gps_max_accuracy_m;

-- 4) funções do rastreamento
drop function if exists public.orders_cancel_delivery();
drop function if exists public.deliveries_broadcast();
drop function if exists public.dispatch_order(uuid, uuid, double precision, double precision);
drop function if exists public.dispatch_order(uuid, uuid, double precision, double precision, boolean);
drop function if exists public.courier_report_position(uuid, double precision, double precision, real, real, timestamptz);
drop function if exists public.courier_confirm_delivery(uuid);
drop function if exists public.courier_return_delivery(uuid, text);
drop function if exists public.courier_set_eta(uuid, integer, real, text);
drop function if exists public.courier_set_eta(uuid, integer, real, text, text);
drop function if exists public.order_tracking(uuid);
drop function if exists public.order_set_destination(uuid, double precision, double precision, text);
drop function if exists public.admin_set_courier(text, boolean);
drop function if exists public.admin_list_couriers();
drop function if exists public.purge_delivery_positions();
drop function if exists public.distance_m(double precision, double precision, double precision, double precision);
drop function if exists public.is_courier();
drop function if exists public.is_order_restaurant_member(uuid);
drop function if exists public.is_restaurant_member(uuid);
drop function if exists public.default_restaurant();
drop function if exists public.google_reserve(text, integer, integer);
drop function if exists public.google_alert(text, date, int, int);
drop function if exists public.google_consolidate();
drop function if exists public.google_period_start(timestamptz);

-- 5) linha do tempo: só eventos de status (os de entrega/rota saem, junto com a regra)
delete from public.order_events where type in ('ENTREGADOR_ATRIBUIDO', 'EM_ROTA', 'CHEGANDO', 'CHEGOU_NO_LOCAL', 'FALHA_NA_ENTREGA', 'ENTREGA_RECUSADA');
alter table public.order_events drop constraint if exists order_events_type_check;
alter table public.order_events add constraint order_events_type_check check (type in (
  'PEDIDO_CRIADO', 'PEDIDO_CONFIRMADO', 'EM_PREPARO', 'PRONTO_PARA_RETIRADA', 'PRONTO', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'RETIRADO', 'CANCELADO'));

-- 6) limites de acesso: só as ações que existem (log_denied só registrava GPS negado)
drop function if exists public.log_denied(text, text, uuid);
drop function if exists public.log_denied(text, text);
delete from public.access_attempts where action in ('rastreio_negado', 'gps', 'mapas');
alter table public.access_attempts drop constraint if exists access_attempts_action_check;
alter table public.access_attempts add constraint access_attempts_action_check check (action in ('pedido', 'login_admin', 'codigo_2fa'));
