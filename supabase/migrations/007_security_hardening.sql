-- 007: endurecimento (resultado da revisão das migrações).
--
--   1) "Meus pedidos" rápido: índice composto (user_id, created_at desc)
--   2) Login com Google/Apple: nome do perfil aceita texto ou objeto {firstName, lastName} e é sempre limpo
--   3) Contas de login anônimo (se algum dia ligadas no Auth) não podem fazer pedido
--   4) Taxa de entrega e desconto: função só para admin (a API de pedidos não deixa ninguém definir valores)
--   5) LGPD: função para anonimizar os dados pessoais dos pedidos de quem apagou a conta

-- 1) Histórico do cliente: where user_id = ? order by created_at desc
create index orders_user_created_idx on public.orders (user_id, created_at desc);
drop index public.orders_user_id_idx;

-- 2) Perfil: nome vindo do Google ({"full_name": ...}), da Apple ({"name": "..."} ou {"name": {"firstName", "lastName"}})
--    ou do cadastro por e-mail. O papel é SEMPRE 'customer' (metadado do cadastro nunca vira papel).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text;
begin
  v_name := coalesce(
    case when jsonb_typeof(v_meta -> 'full_name') = 'string' then nullif(btrim(v_meta ->> 'full_name'), '') end,
    case when jsonb_typeof(v_meta -> 'name')      = 'string' then nullif(btrim(v_meta ->> 'name'), '') end,
    case when jsonb_typeof(v_meta -> 'name')      = 'object'
         then nullif(btrim(concat_ws(' ', v_meta -> 'name' ->> 'firstName', v_meta -> 'name' ->> 'lastName')), '') end
  );
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    nullif(public.clean_text(v_name, 120), ''),
    case when new.phone ~ '^[0-9+()\s.-]{8,20}$' then new.phone end,
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- O nome do perfil também é limpo quando o próprio cliente o edita pela API
create or replace function public.profiles_clean()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name := nullif(public.clean_text(new.full_name, 120), '');
  return new;
end;
$$;

create trigger profiles_clean
  before insert or update of full_name on public.profiles
  for each row execute function public.profiles_clean();

-- 3) Pedido: só conta autenticada de verdade (não anônima). Com o login anônimo desligado (padrão) isto é só uma segunda trava.
drop policy orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

-- 4) Taxa de entrega e desconto: ÚNICA porta, só admin, só em pedido aberto (pending ou confirmed); recalcula o total
create or replace function public.admin_set_order_amounts(p_order_id uuid, p_delivery_fee_cents integer, p_discount_cents integer)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.orders;
begin
  if not (select public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_delivery_fee_cents is null or p_discount_cents is null or p_delivery_fee_cents < 0 or p_discount_cents < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  update public.orders o
     set delivery_fee_cents = p_delivery_fee_cents,
         discount_cents     = p_discount_cents,
         total_cents        = o.subtotal_cents + p_delivery_fee_cents - p_discount_cents
   where o.id = p_order_id and o.status in ('pending', 'confirmed')
  returning o.* into v;
  if v.id is null then
    raise exception 'order_not_found_or_closed' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function public.admin_set_order_amounts(uuid, integer, integer) from public, anon;
grant execute on function public.admin_set_order_amounts(uuid, integer, integer) to authenticated;

-- 5) LGPD: quando a conta é apagada, o pedido FICA (histórico e obrigações fiscais), mas os dados pessoais saem
--    (nome, telefone, endereço e observações dos pedidos; nome e texto das mensagens de contato).
--    Chame no fluxo de exclusão de conta, com a chave de serviço (service_role). Ninguém mais executa.
create or replace function public.anonymize_customer_data(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.orders o
     set customer_name  = 'Cliente removido',
         customer_phone = null,
         notes          = null,
         delivery_address = case when o.order_type = 'delivery'
           then jsonb_build_object('street', 'removido', 'number', '0', 'district', 'removido',
                                   'city', coalesce(o.delivery_address ->> 'city', 'removido'),
                                   'state', coalesce(o.delivery_address ->> 'state', 'SP'), 'zip_code', '00000000')
           else null end
   where o.user_id = p_user_id;
  get diagnostics n = row_count;                                   -- quantidade de pedidos anonimizados
  update public.order_items i set notes = null from public.orders o where o.id = i.order_id and o.user_id = p_user_id;
  update public.contact_messages set name = 'Cliente removido', message = '(removida)' where user_id = p_user_id;
  return n;
end;
$$;
revoke all on function public.anonymize_customer_data(uuid) from public, anon, authenticated;
