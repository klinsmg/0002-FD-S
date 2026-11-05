-- 001: perfis de clientes (profiles) e endereços (addresses).
--
-- REGRAS (resumo):
--   * Todo usuário do Supabase Auth ganha um perfil automático com papel 'customer' (trigger em auth.users).
--   * Cliente lê e atualiza SÓ o próprio perfil, e só nome e telefone. O papel nunca muda pela API.
--   * Cliente gerencia (lê, cria, edita, apaga) SÓ os próprios endereços.
--   * Admin APENAS LÊ perfis e endereços de todos. Não edita nem apaga dados de clientes.
--   * Visitante anônimo não acessa nada destas tabelas.
--   * Promover alguém a admin é feito à mão no SQL Editor (nunca pelo app, nunca por metadado de cadastro):
--       update public.profiles set role = 'admin' where id = '<uuid do usuário>';
--
-- Esta migração roda ANTES das demais (o nome começa com 001) e define public.is_admin(), usada nas outras.

-- ---------------------------------------------------------------------------
-- Papéis
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('customer', 'admin');

-- ---------------------------------------------------------------------------
-- profiles: 1 linha por usuário de auth.users (apagar o usuário apaga o perfil)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (full_name is null or char_length(full_name) between 1 and 120),
  phone       text check (phone is null or phone ~ '^[0-9+()\s.-]{8,20}$'),
  role        public.app_role not null default 'customer',
  created_at  timestamptz not null default now()
);

comment on table  public.profiles      is 'Perfil de cada usuário do Auth. Criado automaticamente por handle_new_user().';
comment on column public.profiles.role is 'customer (padrão) ou admin. Só muda por SQL manual: nenhuma política nem permissão deixa o app alterar.';

-- ---------------------------------------------------------------------------
-- addresses: vários endereços por cliente
-- ---------------------------------------------------------------------------
create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  label       text not null default 'Casa' check (char_length(label) between 1 and 40),
  street      text not null check (char_length(street) between 1 and 120),
  number      text not null check (char_length(number) between 1 and 10),
  complement  text check (char_length(complement) <= 60),
  district    text not null check (char_length(district) between 1 and 100),
  city        text not null check (char_length(city) between 1 and 100),
  state       text not null check (state ~ '^[A-Z]{2}$'),
  zip_code    text not null check (zip_code ~ '^[0-9]{8}$'),       -- só dígitos (sem hífen)
  reference   text check (char_length(reference) <= 150),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.addresses is 'Endereços salvos do cliente (vários por usuário). Cada linha pertence a um único usuário.';

create index addresses_user_id_idx on public.addresses (user_id);

-- No máximo UM endereço padrão por cliente.
create unique index addresses_one_default_per_user on public.addresses (user_id) where is_default;

-- Ao marcar um endereço como padrão, desmarca os outros do mesmo cliente (evita erro do índice acima).
create or replace function public.addresses_single_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default then
    update public.addresses set is_default = false
     where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

create trigger addresses_single_default
  before insert or update of is_default on public.addresses
  for each row execute function public.addresses_single_default();

-- Limite de 10 endereços por cliente: impede encher o banco com lixo a partir de uma conta.
create or replace function public.addresses_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.addresses where user_id = new.user_id) >= 10 then
    raise exception 'limite_de_enderecos' using errcode = '23514', detail = 'Máximo de 10 endereços por cliente.';
  end if;
  return new;
end;
$$;

create trigger addresses_limit
  before insert on public.addresses
  for each row execute function public.addresses_limit();

-- ---------------------------------------------------------------------------
-- handle_new_user: cria o perfil (customer) quando nasce um usuário em auth.users
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER para poder gravar em public.profiles mesmo sem política de INSERT para o cliente.
-- O papel é SEMPRE 'customer': raw_user_meta_data é preenchido pelo próprio usuário no cadastro e jamais é usado para papel.
-- O nome vem de raw_user_meta_data->>'full_name' (ou ->>'name'), limpo e cortado em 120 caracteres.
-- O telefone só é copiado se tiver formato válido: um valor estranho nunca pode derrubar o cadastro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
    ), 120),
    case when new.phone ~ '^[0-9+()\s.-]{8,20}$' then new.phone end,
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Só o trigger usa esta função: ninguém a chama pela API.
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuários que já existiam antes desta migração também ganham perfil.
insert into public.profiles (id, full_name)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), '')), 120)
  from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- is_admin(): usada pelas políticas (aqui e nas outras migrações)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER para ler profiles sem passar pelo RLS (evita recursão dentro das próprias políticas).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permissões (nível de tabela/coluna): o mínimo necessário. O RLS abaixo restringe as LINHAS.
-- ---------------------------------------------------------------------------
revoke all on public.profiles  from anon, authenticated;
revoke all on public.addresses from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;   -- 'role' e 'id' ficam de fora: ninguém se promove

grant select, insert, update, delete on public.addresses to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.addresses enable row level security;

-- profiles: SELECT
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));                       -- cliente lê o próprio perfil

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using ((select public.is_admin()));                     -- admin lê todos (somente leitura)

-- profiles: UPDATE (só o próprio, só nome e telefone: restrição de colunas está nos GRANTs acima)
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- profiles: INSERT e DELETE
--   Propositalmente SEM política (= negado para todos pela API): o perfil nasce pelo trigger handle_new_user()
--   e some junto com o usuário (on delete cascade). Ninguém cria, apaga ou "troca de dono" perfil pelo app.

-- addresses: SELECT
create policy addresses_select_own on public.addresses
  for select to authenticated
  using (user_id = (select auth.uid()));                  -- cliente lê só os próprios endereços

create policy addresses_select_admin on public.addresses
  for select to authenticated
  using ((select public.is_admin()));                     -- admin lê todos (somente leitura)

-- addresses: INSERT (só para si mesmo)
create policy addresses_insert_own on public.addresses
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- addresses: UPDATE (só os próprios; o with check impede "passar" o endereço para outro usuário)
create policy addresses_update_own on public.addresses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- addresses: DELETE (só os próprios)
create policy addresses_delete_own on public.addresses
  for delete to authenticated
  using (user_id = (select auth.uid()));
