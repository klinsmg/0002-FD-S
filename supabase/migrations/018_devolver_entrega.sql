-- 018 (Fase 3): o entregador pode recusar (antes de sair) ou devolver a entrega para a loja (cliente ausente, endereço
-- não encontrado, outro). A entrega fecha como 'cancelled' (recusa) ou 'failed', o pedido volta para "Pronto" e a loja
-- pode despachar de novo (para o mesmo ou outro entregador) ou cancelar. Fica registrado na linha do tempo.
-- Reversão: supabase/rollback/018_down.sql

-- um pedido pode ter várias tentativas de entrega, mas só UMA ativa por vez
alter table public.deliveries drop constraint if exists deliveries_order_id_key;
create unique index if not exists deliveries_uma_ativa on public.deliveries (order_id)
  where status in ('assigned', 'en_route', 'arriving', 'arrived');
create index if not exists deliveries_order_idx on public.deliveries (order_id, created_at desc);

alter table public.order_events drop constraint if exists order_events_type_check;
alter table public.order_events add constraint order_events_type_check check (type in ('PEDIDO_CRIADO', 'PEDIDO_CONFIRMADO', 'EM_PREPARO',
  'PRONTO_PARA_RETIRADA', 'PRONTO', 'ENTREGADOR_ATRIBUIDO', 'SAIU_PARA_ENTREGA', 'EM_ROTA', 'CHEGANDO', 'CHEGOU_NO_LOCAL', 'ENTREGUE',
  'RETIRADO', 'CANCELADO', 'FALHA_NA_ENTREGA', 'ENTREGA_RECUSADA'));

-- motivo: recusada (só antes de começar a andar) | cliente_ausente | endereco_nao_encontrado | outro
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
  if d.id is null or d.courier_id is distinct from (select auth.uid()) or not public.is_courier()
     or d.status not in ('assigned', 'en_route', 'arriving', 'arrived') then
    return 'not_assigned';
  end if;
  if p_motivo = 'recusada' and d.status <> 'assigned' then return 'already_started'; end if;

  update public.deliveries set status = case when p_motivo = 'recusada' then 'cancelled' else 'failed' end, finished_at = now()
   where id = d.id;
  -- volta para "Pronto" (só o fluxo do entregador faz isto; a API comum não deixa voltar etapa)
  update public.orders set status = 'ready' where id = d.order_id and status = 'out_for_delivery';
  insert into public.order_events (order_id, type, data)
  values (d.order_id, case when p_motivo = 'recusada' then 'ENTREGA_RECUSADA' else 'FALHA_NA_ENTREGA' end, jsonb_build_object('motivo', p_motivo));
  return 'ok';
end;
$$;
revoke all on function public.courier_return_delivery(uuid, text) from public, anon;
grant execute on function public.courier_return_delivery(uuid, text) to authenticated;

-- O gatilho da linha do tempo registraria "PRONTO" de novo quando o pedido volta: tudo bem (mostra que voltou à loja).
