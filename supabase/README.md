# Supabase – MDogão Itapevi

## Arquivos

| Arquivo | Para quê |
|---|---|
| `lib/supabase/client.ts` | cliente do navegador (chave publishable, tipado com `Database`) |
| `lib/supabase/server.ts` | cliente de Server Components/Actions (cookies, tipado) |
| `lib/database.types.ts` | tipos gerados do banco |
| `supabase/migrations/001…008` | esquema (001–007) e cardápio inicial (008) |
| `supabase/scripts/admin_bootstrap.sql` | promove o primeiro admin (manual, NÃO é migração) |
| `.env.example` | modelo das variáveis (sem valores) |

Ordem das migrações: 001 perfis/endereços · 002 catálogo · 003 pedidos · 004 relatórios · 005 extensões do catálogo · 006 extensões de pedido (`create_order`) · 007 endurecimento/LGPD · 008 dados do cardápio.

## 1. Variáveis de ambiente

Copie `.env.example` para `.env.local` (já está no `.gitignore`) e preencha com os valores de *Project Settings → API*.
`SUPABASE_SERVICE_ROLE_KEY` só no servidor, nunca com prefixo `NEXT_PUBLIC_`.

## 2. Aplicar as migrações

**Pelo Supabase CLI (recomendado)**
```
npx supabase login --token <seu-token>        # token em dashboard/account/tokens; não compartilhe
npx supabase link --project-ref gdvwiktwrysxvfdgorpx
npx supabase db push --dry-run --remote       # só lista, não altera
npx supabase db push --remote                 # aplica
```

**Pelo SQL Editor** (painel → SQL Editor → New query)
Cole e rode, **um arquivo por vez e em ordem**, de `001` a `008`. Se um falhar, pare e corrija antes do próximo.
Obs.: pelo editor o Supabase não registra o histórico de migrações; se depois usar o CLI no mesmo banco, rode `npx supabase migration repair --status applied 001 002 … 008`.

## 3. Primeiro administrador

1. Crie a conta: *Authentication → Users → Add user* (ou cadastre-se pelo site). O perfil nasce `customer`.
2. Copie o **UID** do usuário.
3. No SQL Editor, rode (troque pelo UID, entre aspas simples):
```sql
update public.profiles set role = 'admin'
 where id = '<UID-copiado>'::uuid
returning id, full_name, role;
```
Deve voltar 1 linha com `role = admin`. Não grave o UID no repositório.

## 4. Consultas de validação (somente leitura, SQL Editor)

```sql
-- contagens esperadas: 9 / 14 / 138 / 18 / 18 / 1 / 7
select (select count(*) from sections) secoes, (select count(*) from categories) categorias,
       (select count(*) from products) produtos, (select count(*) from product_variants) variantes,
       (select count(*) from extras) extras, (select count(*) from store_settings) loja,
       (select count(*) from business_hours) horarios;

-- RLS ligado em todas as tabelas: deve devolver 0 linhas
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;

-- views com security_invoker: 3 linhas, todas com 'security_invoker=true'
select relname, reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v';

-- funções que o visitante anônimo executa: deve aparecer só is_admin entre as SECURITY DEFINER
select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where s.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE');

-- exatamente 1 admin (depois do passo 3)
select id, full_name, role from public.profiles where role = 'admin';

-- amostra do cardápio (preço em centavos; NULL = valor a confirmar)
select c.name categoria, p.name, p.price_cents from products p join categories c on c.id = p.category_id
 order by c.sort_order, p.sort_order limit 10;
```

## 5. Regenerar os tipos (após mudar o banco)
```
npx supabase gen types typescript --project-id gdvwiktwrysxvfdgorpx --schema public > $TEMP/db.ts
```
Confira que o arquivo começa com `export type Json` e copie para `lib/database.types.ts`.

## 6. Antes do login funcionar no site (ainda não implementado)
Authentication → URL Configuration (site URL e redirect URLs); ative Google/Apple se for usar; o site ainda precisa das telas de login e do callback.
