-- 002: catálogo simples (categories e products).
--
-- REGRAS (resumo):
--   * Qualquer visitante (inclusive anônimo) lê categorias e produtos ATIVOS.
--   * Só admin (public.is_admin(), definida na migração 001) cria, atualiza e exclui categorias e produtos.
--   * Admin também lê os itens inativos (para poder reativá-los e editá-los no painel).
--   * Preço em CENTAVOS, inteiro e nunca negativo (evita erro de arredondamento de decimais).
--   * Apagar uma categoria NÃO apaga os produtos: eles ficam sem categoria (category_id = null).

-- ---------------------------------------------------------------------------
-- Utilitário: mantém products.updated_at em dia a cada UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table  public.categories        is 'Categorias do catálogo. Visitantes só enxergam as ativas.';
comment on column public.categories.slug   is 'Identificador único para URL: minúsculas, números e hífens (ex.: hot-dog).';

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.categories (id) on delete set null,
  name         text not null check (char_length(name) between 1 and 120),
  description  text check (char_length(description) <= 600),
  price_cents  integer not null check (price_cents >= 0),
  image_url    text check (image_url is null or image_url ~ '^(https://|/)'),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table  public.products             is 'Produtos do catálogo. Visitantes só enxergam os ativos.';
comment on column public.products.price_cents is 'Preço em centavos (ex.: R$ 23,00 = 2300). Inteiro, nunca negativo.';
comment on column public.products.category_id is 'Ao apagar a categoria, vira null (o produto não é apagado).';

create index products_category_id_idx on public.products (category_id);
create index products_active_idx      on public.products (active);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permissões (nível de tabela): leitura para todos; escrita só liberada ao papel "authenticated",
-- e o RLS abaixo deixa passar apenas o admin. Visitante anônimo nunca escreve.
-- ---------------------------------------------------------------------------
revoke all on public.categories, public.products from anon, authenticated;
grant select on public.categories, public.products to anon, authenticated;
grant insert, update, delete on public.categories, public.products to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products   enable row level security;

-- categories: SELECT
create policy categories_select_public on public.categories
  for select to anon, authenticated
  using (active);                                          -- qualquer visitante lê as ativas

create policy categories_select_admin on public.categories
  for select to authenticated
  using ((select public.is_admin()));                      -- admin lê todas, inclusive inativas

-- categories: INSERT / UPDATE / DELETE (somente admin)
create policy categories_insert_admin on public.categories
  for insert to authenticated
  with check ((select public.is_admin()));

create policy categories_update_admin on public.categories
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy categories_delete_admin on public.categories
  for delete to authenticated
  using ((select public.is_admin()));

-- products: SELECT
create policy products_select_public on public.products
  for select to anon, authenticated
  using (active);                                          -- qualquer visitante lê os ativos

create policy products_select_admin on public.products
  for select to authenticated
  using ((select public.is_admin()));                      -- admin lê todos, inclusive inativos

-- products: INSERT / UPDATE / DELETE (somente admin)
create policy products_insert_admin on public.products
  for insert to authenticated
  with check ((select public.is_admin()));

create policy products_update_admin on public.products
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy products_delete_admin on public.products
  for delete to authenticated
  using ((select public.is_admin()));
