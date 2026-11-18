-- 013: tempo real (Supabase Realtime, broadcast em canais PRIVADOS, wss autenticado com o JWT do usuário).
-- Canais:
--   pedido:<id>  -> o dono do pedido e o admin. Mudança de status (e, no bloco 12, posição aproximada e ETA).
--   loja         -> só admin. Pedido novo e mudança de status de qualquer pedido.
-- O banco é quem publica (gatilho abaixo); ninguém publica pelo navegador (não há política de INSERT em realtime.messages).
-- A mensagem leva só o mínimo (id, número, status): a tela busca o resto pelo servidor, com RLS.

create or replace function public.orders_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  if tg_op = 'UPDATE' then
    perform realtime.send(jsonb_build_object('status', new.status), 'status', 'pedido:' || new.id, true);
  end if;
  perform realtime.send(
    jsonb_build_object('evento', case when tg_op = 'INSERT' then 'novo' else 'status' end, 'id', new.id, 'numero', new.order_number, 'status', new.status),
    'pedido', 'loja', true);
  return null;
end;
$$;
revoke all on function public.orders_broadcast() from public, anon, authenticated;

drop trigger if exists orders_broadcast on public.orders;
create trigger orders_broadcast
  after insert or update of status on public.orders
  for each row execute function public.orders_broadcast();

-- Quem pode ENTRAR em cada canal privado (o Realtime confere esta política ao assinar).
drop policy if exists tempo_real_ler on realtime.messages;
create policy tempo_real_ler on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      ((select public.is_admin()) and (realtime.topic() = 'loja' or realtime.topic() like 'pedido:%'))
      or (realtime.topic() like 'pedido:%' and exists (
            select 1 from public.orders o
             where o.user_id = (select auth.uid()) and o.id::text = substr(realtime.topic(), 8)))
    )
  );
