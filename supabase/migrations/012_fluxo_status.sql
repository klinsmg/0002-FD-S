-- 012: fluxo de status do pedido conferido no banco (vale para o quadro da loja, a tela do pedido e qualquer chamada à API).
--   Novo (pending; 'confirmed' antigo conta como Novo) -> Em preparo -> Pronto
--   Pronto + ENTREGA  -> Saiu para entrega -> Entregue (este último só pelo fluxo do entregador, bloco 11)
--   Pronto + RETIRADA -> Entregue (botão "Retirado")
--   Cancelar: de qualquer status aberto. Entregue e Cancelado são finais.
-- Só trava quem usa a API (role authenticated). Funções security definer (ex.: confirmação de entrega do entregador)
-- e o postgres/service_role (importação de histórico) passam, pois fazem as próprias checagens.

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
      or (p_de = 'ready' and p_tipo <> 'delivery' and p_para = 'delivered');
$$;

create or replace function public.orders_status_flow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not public.order_status_ok(old.status, new.status, new.order_type) then
    raise exception 'invalid_status_transition' using errcode = '23514',
      detail = format('%s -> %s (%s)', old.status, new.status, new.order_type);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_status_flow on public.orders;
create trigger orders_status_flow
  before update of status on public.orders
  for each row execute function public.orders_status_flow();

revoke all on function public.order_status_ok(public.order_status, public.order_status, text) from public, anon;
grant execute on function public.order_status_ok(public.order_status, public.order_status, text) to authenticated;
