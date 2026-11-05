-- 003: pedidos (orders) e itens (order_items).
--
-- REGRAS (resumo):
--   * Cliente logado cria e lê SÓ os próprios pedidos e os itens deles. Não atualiza nem exclui pedido.
--   * Admin lê todos os pedidos e itens e atualiza APENAS status, payment_method e notes.
--   * Visitante anônimo não acessa nada.
--   * Valores em CENTAVOS (integer, nunca negativos). O item guarda product_name e os preços do momento da compra:
--     mudar ou apagar o produto depois não altera o histórico.
--
-- SEGURANÇA: como o cliente cria o pedido direto pela API, o banco NÃO confia em nada que o cliente mande sobre dinheiro:
--   - o cliente só pode preencher (user_id, customer_name, customer_phone, order_type, payment_method, notes, delivery_address)
--     no pedido e (order_id, product_id, quantity) no item. Status, taxa, desconto e totais nascem nos valores padrão;
--   - nome e preço do item vêm da tabela products (002), nunca do cliente;
--   - subtotal e total são recalculados pelo banco a cada item inserido, e uma regra (CHECK) garante
--     total = subtotal + taxa - desconto;
--   - itens só podem ser acrescentados ao próprio pedido, ainda pendente e nos primeiros 10 minutos.

-- ---------------------------------------------------------------------------
-- Tipos e utilitários
-- ---------------------------------------------------------------------------
create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled');

-- Limpa texto vindo do cliente: tira caracteres de controle e de inversão de texto (ex.: U+202E), junta espaços e corta.
create or replace function public.clean_text(t text, max_len int)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    btrim(regexp_replace(
      regexp_replace(coalesce(t, ''), '[\x01-\x1f\x7f-\x9f​-‏  ‪-‮⁠-⁩﻿]', ' ', 'g'),
      '\s+', ' ', 'g'
    )),
    max_len
  );
$$;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete set null,   -- se a conta for apagada, o pedido fica (histórico)
  customer_name       text not null check (char_length(customer_name) between 1 and 60),
  customer_phone      text check (customer_phone is null or customer_phone ~ '^[0-9+()\s.-]{8,20}$'),
  order_type          text not null check (order_type in ('pickup', 'delivery')),
  status              public.order_status not null default 'pending',
  payment_method      text check (payment_method is null or payment_method in ('cash', 'pix', 'credit_card', 'debit_card', 'other')),
  subtotal_cents      integer not null default 0 check (subtotal_cents >= 0),
  delivery_fee_cents  integer not null default 0 check (delivery_fee_cents >= 0),
  discount_cents      integer not null default 0 check (discount_cents >= 0),
  total_cents         integer not null default 0 check (total_cents >= 0),
  notes               text check (char_length(notes) <= 300),
  delivery_address    jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint orders_total_matches check (total_cents = subtotal_cents + delivery_fee_cents - discount_cents),
  -- retirada não tem endereço; entrega exige o endereço completo
  constraint orders_address_matches_type check (
    (order_type = 'pickup' and delivery_address is null)
    or
    (order_type = 'delivery' and jsonb_typeof(delivery_address) = 'object'
       and delivery_address ?& array['street', 'number', 'district', 'city', 'state', 'zip_code'])
  )
);

comment on table  public.orders                  is 'Pedidos. O cliente cria e lê os próprios; o admin lê todos e muda só status, forma de pagamento e observações.';
comment on column public.orders.user_id          is 'Dono do pedido (auth.users). Vira null se a conta for apagada.';
comment on column public.orders.delivery_address is 'Entrega: {street, number, complement?, district, city, state, zip_code, reference?}. Pickup: null.';
comment on column public.orders.total_cents      is 'Sempre subtotal + taxa de entrega - desconto (garantido por CHECK). Calculado pelo banco.';

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_status_idx     on public.orders (status);
create index orders_user_id_idx    on public.orders (user_id);

-- ---------------------------------------------------------------------------
-- order_items (foto do item no momento da compra)
-- ---------------------------------------------------------------------------
create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  product_id         uuid references public.products (id) on delete set null,   -- o produto pode sumir; o histórico fica
  product_name       text not null check (char_length(product_name) between 1 and 120),
  quantity           integer not null check (quantity between 1 and 99),
  unit_price_cents   integer not null check (unit_price_cents >= 0),
  total_price_cents  integer not null check (total_price_cents >= 0),
  constraint order_items_total_matches check (total_price_cents = unit_price_cents * quantity)
);

comment on table  public.order_items              is 'Itens do pedido. Nome e preços são copiados do produto na hora da compra (histórico).';
comment on column public.order_items.product_name is 'Cópia do nome do produto no momento da compra.';

create index order_items_order_id_idx   on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();   -- função criada na migração 002

-- Pedido novo: limpa os textos, valida o endereço e zera tudo que é dinheiro/estado (o cliente não decide isso).
create or replace function public.orders_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_addr jsonb;
  v_zip  text;
  v_uf   text;
begin
  new.customer_name  := public.clean_text(new.customer_name, 60);
  new.customer_phone := nullif(btrim(new.customer_phone), '');
  new.notes          := nullif(public.clean_text(new.notes, 300), '');

  if new.order_type = 'delivery' then
    v_addr := coalesce(new.delivery_address, '{}'::jsonb);
    if jsonb_typeof(v_addr) <> 'object' then
      raise exception 'invalid_delivery_address' using errcode = '22023';
    end if;
    v_zip := regexp_replace(coalesce(v_addr ->> 'zip_code', ''), '\D', '', 'g');
    v_uf  := upper(public.clean_text(v_addr ->> 'state', 2));
    if length(v_zip) <> 8 or v_uf !~ '^[A-Z]{2}$'
       or public.clean_text(v_addr ->> 'street', 120) = ''
       or public.clean_text(v_addr ->> 'number', 10) = ''
       or public.clean_text(v_addr ->> 'district', 100) = ''
       or public.clean_text(v_addr ->> 'city', 100) = '' then
      raise exception 'invalid_delivery_address' using errcode = '22023';
    end if;
    -- reconstrói o objeto só com as chaves permitidas e textos limpos (nada de chaves extras do cliente)
    new.delivery_address := jsonb_strip_nulls(jsonb_build_object(
      'street',     public.clean_text(v_addr ->> 'street', 120),
      'number',     public.clean_text(v_addr ->> 'number', 10),
      'complement', nullif(public.clean_text(v_addr ->> 'complement', 60), ''),
      'district',   public.clean_text(v_addr ->> 'district', 100),
      'city',       public.clean_text(v_addr ->> 'city', 100),
      'state',      v_uf,
      'zip_code',   v_zip,
      'reference',  nullif(public.clean_text(v_addr ->> 'reference', 150), '')
    ));
  else
    new.delivery_address := null;
  end if;

  -- pedido novo nasce pendente e sem valores; os totais vêm dos itens
  new.status := 'pending';
  new.subtotal_cents := 0;
  new.delivery_fee_cents := 0;
  new.discount_cents := 0;
  new.total_cents := 0;

  -- freio de abuso: no máximo 20 pedidos por hora por cliente
  if new.user_id is not null
     and (select count(*) from public.orders o where o.user_id = new.user_id and o.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_orders' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger orders_prepare
  before insert on public.orders
  for each row execute function public.orders_prepare();

-- Item novo: nome e preço vêm do catálogo (produto ativo); o cliente só informa produto e quantidade.
create or replace function public.order_items_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prod record;
begin
  select p.id, p.name, p.price_cents into v_prod
    from public.products p
   where p.id = new.product_id and p.active;
  if v_prod.id is null then
    raise exception 'product_unavailable' using errcode = '22023';
  end if;

  if new.quantity is null or new.quantity < 1 or new.quantity > 99 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  if (select count(*) from public.order_items i where i.order_id = new.order_id) >= 60 then
    raise exception 'too_many_items' using errcode = '23514';
  end if;

  if v_prod.price_cents::bigint * new.quantity > 100000000 then
    raise exception 'item_total_too_large' using errcode = '22003';
  end if;

  new.product_name      := v_prod.name;
  new.unit_price_cents  := v_prod.price_cents;
  new.total_price_cents := v_prod.price_cents * new.quantity;
  return new;
end;
$$;

create trigger order_items_prepare
  before insert on public.order_items
  for each row execute function public.order_items_prepare();

-- Recalcula subtotal e total do pedido sempre que os itens mudam.
-- SECURITY DEFINER: o cliente não tem permissão de UPDATE em orders; só o banco atualiza os totais.
create or replace function public.order_items_recalc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
  v_sum   bigint;
begin
  select coalesce(sum(i.total_price_cents), 0) into v_sum from public.order_items i where i.order_id = v_order;
  if v_sum > 100000000 then
    raise exception 'order_total_too_large' using errcode = '22003';
  end if;
  update public.orders o
     set subtotal_cents = v_sum,
         total_cents    = v_sum + o.delivery_fee_cents - o.discount_cents
   where o.id = v_order;
  return null;
end;
$$;

revoke all on function public.order_items_recalc() from public, anon, authenticated;

create trigger order_items_recalc
  after insert or update or delete on public.order_items
  for each row execute function public.order_items_recalc();

-- ---------------------------------------------------------------------------
-- Permissões (tabela/coluna): o mínimo. O RLS abaixo restringe as LINHAS.
-- ---------------------------------------------------------------------------
revoke all on public.orders, public.order_items from anon, authenticated;

grant select on public.orders, public.order_items to authenticated;

-- O cliente só preenche estas colunas ao criar o pedido; o resto usa os valores padrão e os gatilhos.
grant insert (user_id, customer_name, customer_phone, order_type, payment_method, notes, delivery_address)
  on public.orders to authenticated;
-- E nos itens, só produto e quantidade.
grant insert (order_id, product_id, quantity) on public.order_items to authenticated;

-- Admin (pelo RLS) só pode mudar estas três colunas: nunca valores, cliente, endereço ou itens.
grant update (status, payment_method, notes) on public.orders to authenticated;

-- Sem DELETE para ninguém pela API. Itens não têm UPDATE nem DELETE.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- orders: SELECT
create policy orders_select_own on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()));                   -- cliente lê só os próprios pedidos

create policy orders_select_admin on public.orders
  for select to authenticated
  using ((select public.is_admin()));                      -- admin lê todos

-- orders: INSERT (cliente cria pedido só para si mesmo; status/valores são forçados pelo gatilho)
create policy orders_insert_own on public.orders
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- orders: UPDATE (só admin; e só as colunas liberadas acima)
create policy orders_update_admin on public.orders
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- orders: DELETE
--   Propositalmente SEM política: ninguém exclui pedido pela API (cliente nem admin). Cancelar = status 'cancelled'.

-- order_items: SELECT
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_items.order_id and o.user_id = (select auth.uid())
  ));                                                      -- cliente lê só os itens dos próprios pedidos

create policy order_items_select_admin on public.order_items
  for select to authenticated
  using ((select public.is_admin()));                      -- admin lê todos os itens

-- order_items: INSERT (só no próprio pedido, ainda pendente e recém-criado: não dá para "inflar" um pedido antigo)
create policy order_items_insert_own on public.order_items
  for insert to authenticated
  with check (exists (
    select 1 from public.orders o
     where o.id = order_items.order_id
       and o.user_id = (select auth.uid())
       and o.status = 'pending'
       and o.created_at > now() - interval '10 minutes'
  ));

-- order_items: UPDATE e DELETE
--   Propositalmente SEM política: itens são imutáveis depois de criados (histórico).
