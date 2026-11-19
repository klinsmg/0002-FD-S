-- Reverte a 018. Rodar manualmente: npx supabase db query --remote -f supabase/rollback/018_down.sql
-- Atenção: só volta a ter "uma entrega por pedido" se não houver pedido com mais de uma tentativa registrada.
drop function if exists public.courier_return_delivery(uuid, text);
alter table public.order_events drop constraint if exists order_events_type_check;
alter table public.order_events add constraint order_events_type_check check (type in ('PEDIDO_CRIADO', 'PEDIDO_CONFIRMADO', 'EM_PREPARO',
  'PRONTO_PARA_RETIRADA', 'PRONTO', 'ENTREGADOR_ATRIBUIDO', 'SAIU_PARA_ENTREGA', 'EM_ROTA', 'CHEGANDO', 'CHEGOU_NO_LOCAL', 'ENTREGUE',
  'RETIRADO', 'CANCELADO', 'FALHA_NA_ENTREGA')) not valid;
drop index if exists public.deliveries_uma_ativa;
drop index if exists public.deliveries_order_idx;
alter table public.deliveries add constraint deliveries_order_id_key unique (order_id);
