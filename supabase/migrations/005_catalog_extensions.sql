-- 005: completa o catálogo (002) com o que o cardápio do site precisa.
--
--   sections          os ícones do topo do cardápio (Hambúrgueres, Hot Dog, Pastéis...)
--   categories        ganha: seção, rótulo curto da aba, descrição, nota e ordem
--   products          ganha: subgrupo, "só informativo", "exige ponto da carne" e ordem; o preço passa a ser opcional
--   product_variants  variações de preço (P/G, 500 ml/1 L...)
--   extras            molhos, adicionais e complementos que o cliente soma ao item
--   store_settings    dados da loja (uma única linha)
--   business_hours    horários de funcionamento
--   contact_messages  mensagens do formulário de contato (criadas só por create_contact)
--
-- REGRAS DE PREÇO (valem em todo o banco):
--   * Preço é sempre em CENTAVOS, inteiro, nunca negativo.
--   * Preço NULL = "valor a confirmar" com a loja pelo WhatsApp.
--   * Produto SEM variantes ativas usa products.price_cents. Produto COM variantes usa o preço da variante escolhida
--     (e products.price_cents fica vazio).
--
-- Leitura pública só do que está ativo; escrita só do admin (public.is_admin(), migração 001).

create type public.extra_type as enum ('sauce', 'addon', 'complement');

-- ---------------------------------------------------------------------------
-- sections
-- ---------------------------------------------------------------------------
create table public.sections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (char_length(name) between 1 and 80),
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.sections is 'Grupos de topo do cardápio (os ícones). Cada seção reúne uma ou mais categorias.';

-- ---------------------------------------------------------------------------
-- categories: colunas novas
-- ---------------------------------------------------------------------------
alter table public.categories
  add column section_id  uuid references public.sections (id) on delete restrict,
  add column short_label text check (char_length(short_label) <= 40),     -- nome curto da aba (ex.: "Tradicionais")
  add column description text check (char_length(description) <= 300),
  add column note        text check (char_length(note) <= 300),
  add column sort_order  int  not null default 0;

create index categories_section_id_idx on public.categories (section_id, sort_order);

-- ---------------------------------------------------------------------------
-- products: colunas novas e preço opcional
-- ---------------------------------------------------------------------------
alter table public.products
  add column group_label       text not null default '' check (char_length(group_label) <= 120),  -- subtítulo dentro da categoria
  add column is_informational  boolean not null default false,  -- só informação (regras, "incluso"): não vira item de pedido
  add column requires_doneness boolean not null default true,   -- o cliente precisa escolher o ponto da carne
  add column sort_order        int  not null default 0;

alter table public.products alter column price_cents drop not null;   -- NULL = valor a confirmar (ou preço nas variantes)

comment on column public.products.price_cents is 'Preço em centavos. NULL = valor a confirmar, ou o preço está em product_variants.';

create unique index products_category_group_name_uq on public.products (category_id, group_label, name);

-- ---------------------------------------------------------------------------
-- product_variants
-- ---------------------------------------------------------------------------
create table public.product_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  label        text not null default '' check (char_length(label) <= 40),   -- 'P', 'G', '500 ml'...
  price_cents  integer check (price_cents is null or (price_cents >= 0 and price_cents < 1000000)),
  sort_order   int  not null default 0,
  active       boolean not null default true,
  unique (product_id, label)
);
comment on table public.product_variants is 'Variações de preço de um produto (P/G, 500 ml/1 L). price_cents NULL = valor a confirmar.';

-- ---------------------------------------------------------------------------
-- extras
-- ---------------------------------------------------------------------------
create table public.extras (
  id           uuid primary key default gen_random_uuid(),
  type         public.extra_type not null,
  name         text not null check (char_length(name) between 1 and 80),
  price_cents  integer check (price_cents is null or (price_cents >= 0 and price_cents < 100000)),
  sort_order   int  not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (type, name)
);
comment on table public.extras is 'Molhos, adicionais e complementos. price_cents NULL = valor a confirmar.';

-- ---------------------------------------------------------------------------
-- store_settings (1 linha) e business_hours
-- ---------------------------------------------------------------------------
create table public.store_settings (
  id               boolean primary key default true check (id),     -- trava em uma linha só
  name             text not null check (char_length(name) between 1 and 80),
  whatsapp         text not null check (whatsapp ~ '^[0-9]{12,13}$'),   -- só dígitos com DDI: 5511...
  email            text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  instagram_url    text check (instagram_url is null or instagram_url ~ '^https://'),
  address_street   text,
  address_district text,
  address_zip      text check (address_zip is null or address_zip ~ '^[0-9]{8}$'),
  founded_year     smallint check (founded_year between 1900 and 2100),
  menu_notice      text check (char_length(menu_notice) <= 300),
  updated_at       timestamptz not null default now()
);

create table public.business_hours (
  id               smallint generated always as identity primary key,
  weekday          smallint not null unique check (weekday between 0 and 6),   -- 0 = domingo ... 6 = sábado
  opens_at         time,
  closes_at        time,
  closes_next_day  boolean not null default false,                              -- fecha na madrugada (ex.: 18:00 às 01:00)
  closed           boolean not null default false,
  check (closed or (opens_at is not null and closes_at is not null))
);

-- ---------------------------------------------------------------------------
-- contact_messages
-- ---------------------------------------------------------------------------
create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  name        text not null check (char_length(name) between 1 and 60),
  message     text not null check (char_length(message) between 1 and 500),
  status      text not null default 'new' check (status in ('new', 'read', 'answered', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index contact_messages_status_idx on public.contact_messages (status, created_at desc);
create index contact_messages_user_id_idx on public.contact_messages (user_id);

create trigger extras_set_updated_at           before update on public.extras           for each row execute function public.set_updated_at();
create trigger store_settings_set_updated_at   before update on public.store_settings   for each row execute function public.set_updated_at();
create trigger contact_messages_set_updated_at before update on public.contact_messages for each row execute function public.set_updated_at();

-- Cria a mensagem de contato. Exige login (barra spam anônimo) e limita a 5 por hora por usuário.
create or replace function public.create_contact(p_name text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := public.clean_text(p_name, 60);
  v_msg  text := public.clean_text(p_message, 500);
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'login_required' using errcode = '42501';
  end if;
  if v_name = '' or v_msg = '' then
    raise exception 'name_and_message_required' using errcode = '22023';
  end if;
  if (select count(*) from public.contact_messages m where m.user_id = v_uid and m.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_messages' using errcode = '23514';
  end if;
  insert into public.contact_messages (user_id, name, message) values (v_uid, v_name, v_msg) returning public.contact_messages.id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_contact(text, text) from public, anon;
grant execute on function public.create_contact(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Permissões e RLS
-- ---------------------------------------------------------------------------
revoke all on public.sections, public.product_variants, public.extras, public.store_settings,
              public.business_hours, public.contact_messages from anon, authenticated;

grant select on public.sections, public.product_variants, public.extras, public.store_settings, public.business_hours
  to anon, authenticated;
grant insert, update, delete on public.sections, public.product_variants, public.extras, public.business_hours to authenticated;
grant update on public.store_settings to authenticated;

grant select on public.contact_messages to authenticated;
grant update (status) on public.contact_messages to authenticated;
grant delete on public.contact_messages to authenticated;

alter table public.sections         enable row level security;
alter table public.product_variants enable row level security;
alter table public.extras           enable row level security;
alter table public.store_settings   enable row level security;
alter table public.business_hours   enable row level security;
alter table public.contact_messages enable row level security;

-- sections
create policy sections_select_public on public.sections for select to anon, authenticated using (active);
create policy sections_select_admin  on public.sections for select to authenticated using ((select public.is_admin()));
create policy sections_insert_admin  on public.sections for insert to authenticated with check ((select public.is_admin()));
create policy sections_update_admin  on public.sections for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy sections_delete_admin  on public.sections for delete to authenticated using ((select public.is_admin()));

-- product_variants (visíveis quando ativas e o produto está visível)
create policy variants_select_public on public.product_variants for select to anon, authenticated using (active);
create policy variants_select_admin  on public.product_variants for select to authenticated using ((select public.is_admin()));
create policy variants_insert_admin  on public.product_variants for insert to authenticated with check ((select public.is_admin()));
create policy variants_update_admin  on public.product_variants for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy variants_delete_admin  on public.product_variants for delete to authenticated using ((select public.is_admin()));

-- extras
create policy extras_select_public on public.extras for select to anon, authenticated using (active);
create policy extras_select_admin  on public.extras for select to authenticated using ((select public.is_admin()));
create policy extras_insert_admin  on public.extras for insert to authenticated with check ((select public.is_admin()));
create policy extras_update_admin  on public.extras for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy extras_delete_admin  on public.extras for delete to authenticated using ((select public.is_admin()));

-- store_settings: leitura pública; só admin atualiza (a linha única é criada na carga inicial)
create policy store_select_public on public.store_settings for select to anon, authenticated using (true);
create policy store_update_admin  on public.store_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- business_hours
create policy hours_select_public on public.business_hours for select to anon, authenticated using (true);
create policy hours_insert_admin  on public.business_hours for insert to authenticated with check ((select public.is_admin()));
create policy hours_update_admin  on public.business_hours for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy hours_delete_admin  on public.business_hours for delete to authenticated using ((select public.is_admin()));

-- contact_messages: sem INSERT direto (só create_contact). Admin lê, muda o status e apaga.
create policy contacts_select_admin on public.contact_messages for select to authenticated using ((select public.is_admin()));
create policy contacts_update_admin on public.contact_messages for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy contacts_delete_admin on public.contact_messages for delete to authenticated using ((select public.is_admin()));

-- products: um produto só aparece ao público se ele E a categoria dele estiverem ativos
drop policy products_select_public on public.products;
create policy products_select_public on public.products
  for select to anon, authenticated
  using (
    active
    and (category_id is null or exists (select 1 from public.categories c where c.id = products.category_id and c.active))
  );
