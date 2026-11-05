-- 006: pedidos completos (003) para o cardápio do site: variantes, ponto da carne, extras, preço "a confirmar",
--      número do pedido e a função create_order (cria pedido + itens + extras de uma vez, em uma transação).
--
-- COMO O PREÇO É CALCULADO (sempre pelo banco, nunca pelo cliente):
--   preço do item = preço da variante escolhida (ou products.price_cents se o produto não tem variantes)
--   extras do item = soma de (preço do extra x quantidade do extra), por unidade do item
--   total do item  = (preço do item + extras do item) x quantidade
--   subtotal do pedido = soma dos totais dos itens; total = subtotal + taxa de entrega - desconto
-- Preço NULL (valor a confirmar) conta como 0 no total e marca o pedido com has_price_pending = true.
--
-- As travas abaixo valem para a API do site (papéis anon e authenticated). postgres e service_role (manutenção e
-- importação de histórico) podem informar status, datas e valores.

create type public.doneness_level as enum ('rare', 'medium', 'well_done');   -- mal passado, ao ponto, bem passado

-- ---------------------------------------------------------------------------
-- orders: número legível, flag de preço pendente e dono vindo do login
-- ---------------------------------------------------------------------------
alter table public.orders
  add column order_number      bigint generated always as identity,
  add column has_price_pending boolean not null default false;
alter table public.orders add constraint orders_order_number_key unique (order_number);

comment on column public.orders.order_number      is 'Número sequencial para a loja e o cliente se referirem ao pedido.';
comment on column public.orders.has_price_pending is 'true se algum item ou extra ainda está com "valor a confirmar". O total ignora esses valores.';

-- O dono do pedido é SEMPRE quem está logado: o cliente não envia nem escolhe o user_id.
alter table public.orders alter column user_id set default auth.uid();
revoke insert (user_id) on public.orders from authenticated;

-- ---------------------------------------------------------------------------
-- order_items: colunas novas; preço do item pode ser "a confirmar"
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column variant_id    uuid references public.product_variants (id) on delete set null,
  add column variant_label text not null default '' check (char_length(variant_label) <= 40),
  add column doneness      public.doneness_level,
  add column notes         text check (char_length(notes) <= 240),
  add column extras_cents  integer not null default 0 check (extras_cents >= 0),   -- extras por unidade do item
  add column price_pending boolean not null default false;

create index order_items_variant_id_idx on public.order_items (variant_id);

alter table public.order_items alter column unit_price_cents drop not null;
alter table public.order_items alter column total_price_cents set default 0;
alter table public.order_items drop constraint order_items_total_matches;
alter table public.order_items add constraint order_items_total_matches check (
  (unit_price_cents is null and total_price_cents = 0)
  or total_price_cents = (unit_price_cents + extras_cents) * quantity
);

comment on column public.order_items.unit_price_cents is 'Preço unitário na hora da compra. NULL = valor a confirmar.';
comment on column public.order_items.extras_cents     is 'Soma dos extras por UNIDADE do item (preço x quantidade de cada extra).';

-- ---------------------------------------------------------------------------
-- order_item_extras: molhos/adicionais escolhidos em cada item (foto na hora da compra)
-- ---------------------------------------------------------------------------
create table public.order_item_extras (
  id              uuid primary key default gen_random_uuid(),
  order_item_id   uuid not null references public.order_items (id) on delete cascade,
  extra_id        uuid references public.extras (id) on delete set null,
  name            text not null check (char_length(name) between 1 and 80),
  unit_price_cents integer check (unit_price_cents is null or unit_price_cents >= 0),
  quantity        smallint not null check (quantity between 1 and 9),
  unique (order_item_id, extra_id)
);
create index order_item_extras_order_item_id_idx on public.order_item_extras (order_item_id);
create index order_item_extras_extra_id_idx      on public.order_item_extras (extra_id);

comment on table public.order_item_extras is 'Extras de cada item do pedido. Nome e preço copiados do catálogo na hora da compra.';

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------

-- Pedido novo: limpa os textos, valida o endereço e (para a API) zera status e valores.
create or replace function public.orders_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_addr jsonb; v_zip text; v_uf text;
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
       or public.clean_text(v_addr ->> 'street', 120) = '' or public.clean_text(v_addr ->> 'number', 10) = ''
       or public.clean_text(v_addr ->> 'district', 100) = '' or public.clean_text(v_addr ->> 'city', 100) = '' then
      raise exception 'invalid_delivery_address' using errcode = '22023';
    end if;
    -- reconstrói o objeto só com as chaves permitidas e textos limpos
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

  if current_user in ('anon', 'authenticated') then
    new.status := 'pending';
    new.subtotal_cents := 0; new.delivery_fee_cents := 0; new.discount_cents := 0; new.total_cents := 0;
    new.has_price_pending := false;
    -- freio de abuso: no máximo 20 pedidos por hora por cliente
    if new.user_id is not null
       and (select count(*) from public.orders o where o.user_id = new.user_id and o.created_at > now() - interval '1 hour') >= 20 then
      raise exception 'too_many_orders' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Item novo: nome, variante e preço vêm do catálogo; ponto da carne obrigatório quando o produto exige.
create or replace function public.order_items_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prod    record;
  v_var_id  uuid;
  v_label   text := '';
  v_price   integer;
  v_n_var   integer;
begin
  if current_user in ('anon', 'authenticated') then
    select p.id, p.name, p.price_cents, p.requires_doneness into v_prod
      from public.products p
      left join public.categories c on c.id = p.category_id
     where p.id = new.product_id and p.active and not p.is_informational and (p.category_id is null or c.active);
    if v_prod.id is null then
      raise exception 'product_unavailable' using errcode = '22023';
    end if;
    if new.quantity is null or new.quantity < 1 or new.quantity > 99 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    if (select count(*) from public.order_items i where i.order_id = new.order_id) >= 60 then
      raise exception 'too_many_items' using errcode = '23514';
    end if;

    -- variante: a informada (do produto certo e ativa); se o produto tem uma só, ela mesma; se não tem, vale o preço do produto
    if new.variant_id is not null then
      select v.id, v.label, v.price_cents into v_var_id, v_label, v_price
        from public.product_variants v
       where v.id = new.variant_id and v.product_id = v_prod.id and v.active;
      if v_var_id is null then
        raise exception 'invalid_variant' using errcode = '22023';
      end if;
    else
      select count(*) into v_n_var from public.product_variants v where v.product_id = v_prod.id and v.active;
      if v_n_var > 1 then
        raise exception 'variant_required' using errcode = '22023';
      elsif v_n_var = 1 then
        select v.id, v.label, v.price_cents into v_var_id, v_label, v_price
          from public.product_variants v where v.product_id = v_prod.id and v.active;
      else
        v_price := v_prod.price_cents;
      end if;
    end if;

    if v_prod.requires_doneness and new.doneness is null then
      raise exception 'doneness_required' using errcode = '22023';
    end if;
    if not v_prod.requires_doneness then
      new.doneness := null;
    end if;

    if coalesce(v_price, 0)::bigint * new.quantity > 100000000 then
      raise exception 'item_total_too_large' using errcode = '22003';
    end if;

    new.product_name      := v_prod.name;
    new.variant_id        := v_var_id;
    new.variant_label     := coalesce(v_label, '');
    new.unit_price_cents  := v_price;
    new.extras_cents      := 0;
    new.price_pending     := v_price is null;
    new.total_price_cents := coalesce(v_price, 0) * new.quantity;
    new.notes             := nullif(public.clean_text(new.notes, 240), '');
  else
    -- manutenção/importação (postgres, service_role): informa nome e preço; o total é sempre calculado
    if new.product_name is null or new.quantity is null then
      raise exception 'missing_item_fields' using errcode = '22004';
    end if;
    new.price_pending     := new.unit_price_cents is null;
    new.total_price_cents := case when new.unit_price_cents is null then 0
                                  else (new.unit_price_cents + new.extras_cents) * new.quantity end;
  end if;
  return new;
end;
$$;

-- Extra novo: nome e preço vêm do catálogo (extra ativo).
create or replace function public.order_item_extras_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ext record;
begin
  if current_user in ('anon', 'authenticated') then
    select e.id, e.name, e.price_cents into v_ext from public.extras e where e.id = new.extra_id and e.active;
    if v_ext.id is null then
      raise exception 'extra_unavailable' using errcode = '22023';
    end if;
    if (select count(*) from public.order_item_extras x where x.order_item_id = new.order_item_id) >= 12 then
      raise exception 'too_many_extras' using errcode = '23514';
    end if;
    new.name := v_ext.name;
    new.unit_price_cents := v_ext.price_cents;
  elsif new.name is null then
    raise exception 'missing_extra_fields' using errcode = '22004';
  end if;
  return new;
end;
$$;

create trigger order_item_extras_prepare
  before insert on public.order_item_extras
  for each row execute function public.order_item_extras_prepare();

-- Extras mudaram: recalcula o item (SECURITY DEFINER: o cliente não tem UPDATE em order_items).
create or replace function public.order_item_extras_recalc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item uuid := coalesce(new.order_item_id, old.order_item_id);
  v_sum  bigint;
  v_pend boolean;
begin
  select coalesce(sum(coalesce(x.unit_price_cents, 0) * x.quantity), 0), coalesce(bool_or(x.unit_price_cents is null), false)
    into v_sum, v_pend
    from public.order_item_extras x where x.order_item_id = v_item;
  update public.order_items i
     set extras_cents      = v_sum,
         total_price_cents = case when i.unit_price_cents is null then 0 else (i.unit_price_cents + v_sum) * i.quantity end,
         price_pending     = (i.unit_price_cents is null) or v_pend
   where i.id = v_item;
  return null;
end;
$$;
revoke all on function public.order_item_extras_recalc() from public, anon, authenticated;

create trigger order_item_extras_recalc
  after insert or update or delete on public.order_item_extras
  for each row execute function public.order_item_extras_recalc();

-- Itens mudaram: recalcula subtotal, total e a flag de preço pendente do pedido.
create or replace function public.order_items_recalc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
  v_sum   bigint;
  v_pend  boolean;
begin
  select coalesce(sum(i.total_price_cents), 0), coalesce(bool_or(i.price_pending), false)
    into v_sum, v_pend
    from public.order_items i where i.order_id = v_order;
  if v_sum > 100000000 then
    raise exception 'order_total_too_large' using errcode = '22003';
  end if;
  update public.orders o
     set subtotal_cents    = v_sum,
         total_cents       = v_sum + o.delivery_fee_cents - o.discount_cents,
         has_price_pending = v_pend
   where o.id = v_order;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões e RLS das tabelas novas e das colunas novas
-- ---------------------------------------------------------------------------
-- O cliente só informa: produto, variante, quantidade, ponto da carne e observação. O resto vem do banco.
revoke all on public.order_items from authenticated;
grant select on public.order_items to authenticated;
grant insert (order_id, product_id, variant_id, quantity, doneness, notes) on public.order_items to authenticated;

revoke all on public.order_item_extras from anon, authenticated;
grant select on public.order_item_extras to authenticated;
grant insert (order_item_id, extra_id, quantity) on public.order_item_extras to authenticated;

alter table public.order_item_extras enable row level security;

create policy order_item_extras_select_own on public.order_item_extras
  for select to authenticated
  using (exists (
    select 1 from public.order_items i join public.orders o on o.id = i.order_id
     where i.id = order_item_extras.order_item_id and o.user_id = (select auth.uid())
  ));

create policy order_item_extras_select_admin on public.order_item_extras
  for select to authenticated
  using ((select public.is_admin()));

-- extras só entram em item do próprio pedido, ainda pendente e recém-criado (mesma regra dos itens)
create policy order_item_extras_insert_own on public.order_item_extras
  for insert to authenticated
  with check (exists (
    select 1 from public.order_items i join public.orders o on o.id = i.order_id
     where i.id = order_item_extras.order_item_id
       and o.user_id = (select auth.uid())
       and o.status = 'pending'
       and o.created_at > now() - interval '10 minutes'
  ));
-- UPDATE e DELETE: sem política (extras são imutáveis depois de criados).

-- ---------------------------------------------------------------------------
-- create_order: cria pedido + itens + extras em UMA transação (ou tudo ou nada)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: roda com as permissões de quem chama, então RLS, permissões de coluna e gatilhos valem igual.
-- Exige login (anônimo não tem permissão de executar). p_items = lista de objetos:
--   { "product_id": uuid, "variant_id": uuid|null, "quantity": 1..99, "doneness": "rare"|"medium"|"well_done"|null,
--     "notes": texto|null, "extras": [ { "extra_id": uuid, "quantity": 1..9 } ] }
create or replace function public.create_order(
  p_customer_name     text,
  p_order_type        text,
  p_items             jsonb,
  p_customer_phone    text  default null,
  p_payment_method    text  default null,
  p_notes             text  default null,
  p_delivery_address  jsonb default null
)
returns table (r_order_id uuid, r_order_number bigint, r_subtotal_cents integer, r_total_cents integer, r_has_price_pending boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_order   uuid;
  v_item    jsonb;
  v_extra   jsonb;
  v_item_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 60 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  insert into public.orders (customer_name, customer_phone, order_type, payment_method, notes, delivery_address)
  values (p_customer_name, p_customer_phone, p_order_type, p_payment_method, p_notes, p_delivery_address)
  returning public.orders.id into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_item' using errcode = '22023';
    end if;
    insert into public.order_items (order_id, product_id, variant_id, quantity, doneness, notes)
    values (
      v_order,
      (v_item ->> 'product_id')::uuid,
      nullif(v_item ->> 'variant_id', '')::uuid,
      (v_item ->> 'quantity')::int,
      nullif(v_item ->> 'doneness', '')::public.doneness_level,
      v_item ->> 'notes'
    )
    returning public.order_items.id into v_item_id;

    if v_item -> 'extras' is not null then
      if jsonb_typeof(v_item -> 'extras') <> 'array' then
        raise exception 'invalid_extras' using errcode = '22023';
      end if;
      for v_extra in select value from jsonb_array_elements(v_item -> 'extras') loop
        insert into public.order_item_extras (order_item_id, extra_id, quantity)
        values (v_item_id, (v_extra ->> 'extra_id')::uuid, (v_extra ->> 'quantity')::int);
      end loop;
    end if;
  end loop;

  return query
    select o.id, o.order_number, o.subtotal_cents, o.total_cents, o.has_price_pending
      from public.orders o where o.id = v_order;
end;
$$;

revoke all on function public.create_order(text, text, jsonb, text, text, text, jsonb) from public, anon;
grant execute on function public.create_order(text, text, jsonb, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Relatório de produtos: a receita do produto não inclui os extras (que são outro item de venda)
-- ---------------------------------------------------------------------------
create or replace view public.best_selling_products
with (security_invoker = true) as
select
  i.product_id                                                                         as product_id,
  coalesce(max(p.name), (array_agg(i.product_name order by o.created_at desc))[1])     as product_name,
  sum(i.quantity)::bigint                                                              as units_sold,
  coalesce(sum(coalesce(i.unit_price_cents, 0)::bigint * i.quantity), 0)::bigint       as revenue_cents,
  count(distinct i.order_id)                                                           as orders_count
from public.order_items i
join public.orders o on o.id = i.order_id
left join public.products p on p.id = i.product_id
where o.status <> 'cancelled'
  and (select public.is_admin())
group by i.product_id, case when i.product_id is null then i.product_name end
order by units_sold desc, revenue_cents desc;

comment on column public.best_selling_products.revenue_cents is 'Faturamento do produto em centavos: preço unitário x quantidade (sem extras, sem taxa de entrega, sem desconto do pedido). Itens com valor a confirmar contam 0.';
