> **STATUS: RESOLVIDO.** Todas as correções propostas foram integradas às migrações 005–007; o banco duplicado (português) foi removido (opção A). A proposta 006 foi apagada. Validação: 131 verificações aprovadas em Postgres local (PGlite).

# Revisão das migrações do Supabase (MDogão Itapevi)

Revisão feita em **4 de novembro de 2026** sobre as 12 migrações de `supabase/migrations/`.
**Nenhum banco remoto foi tocado.** Toda a verificação rodou num Postgres temporário em memória (PGlite),
com os papéis `anon` e `authenticated` e a função `auth.uid()` simulados. Nada foi alterado nas migrações:
este documento só **relata** e **propõe**. As correções propostas estão em
[`006_hardening_PROPOSTA.sql`](./006_hardening_PROPOSTA.sql) e foram testadas (41 verificações, 0 falhas).

---

## 1. Resumo

| Nível | Qtde | Do que se trata |
|---|---|---|
| **Bloqueante** | 1 | `005_admin_bootstrap.sql` quebra o `supabase db push` |
| **Alto** | 4 | Banco duplicado (EN x PT); RPCs públicos sem limite (spam); taxa/desconto impossíveis de definir; gatilho impede importar histórico |
| **Médio** | 9 | Nome da Apple; perfil sem limpeza; 2 FKs sem índice; "meus pedidos" sem índice; `user_id` sem default; login anônimo; LGPD pós-exclusão; config do Auth; app (callback, COOP, CSP, cookies) |
| **Baixo** | 9 | Detalhes de limpeza, consistência e configuração |
| **OK** | — | RLS em 17/17 tabelas, views com `security_invoker`, sem segredos, ordem de execução, histórico e relatórios |

### Checklist do que foi pedido

| Item verificado | Resultado |
|---|---|
| Ordem correta de execução | ⚠️ ordem e dependências estão certas, **mas a 005 trava o push** (B1) |
| Sintaxe PostgreSQL/Supabase | ✅ todas aplicam sem erro (exceto a 005, que precisa de substituição manual por desenho) |
| Foreign keys e índices | ⚠️ 13 FKs; 11 com índice, **2 sem** (M3); falta índice composto (M4) |
| RLS em todas as tabelas públicas | ✅ 17 de 17, nenhuma política para `public`, nenhuma tabela sem permissão definida |
| Políticas para `anon` e `authenticated` | ✅ matriz abaixo; ⚠️ RPCs públicos sem limite (A2) |
| Views com `security_invoker = true` | ✅ 3 de 3 |
| Ausência de segredos, chaves, dados fictícios | ✅ nenhum segredo, nenhum UUID fixo, nenhum dado fictício |
| Compatibilidade com login Google/Apple | ⚠️ banco funciona; **corrigir nome da Apple (M1)** e **configurar Auth e app (M8, M9)** |
| Histórico de pedidos e relatórios | ✅ no modelo novo (`orders`); ⚠️ nada disso existe no modelo antigo (A1) |

---

## 2. Problemas e correções propostas

### Bloqueante

**B1. `005_admin_bootstrap.sql` está em `migrations/` e quebra o `db push`**
- *Evidência:* ao aplicar as migrações em ordem, a 005 falha com `syntax error at or near ":"`. Como `005` vem
  antes das migrações com data, o `push` para ali e **as 7 seguintes não são aplicadas**.
- *Correção:* **mover para `supabase/scripts/`** (fora da pasta de migrações) e rodar à mão com `psql -v` ou no SQL Editor.
  Não está na proposta 006 porque é só mover o arquivo.

### Alto

**A1. Dois bancos no mesmo banco (inglês x português)**
- *Evidência:* 17 tabelas públicas; 5 pares equivalentes: `categories`/`categorias`, `products`/`produtos`,
  `orders`/`pedidos`, `order_items`/`pedido_itens`, mais `profiles` (a antiga `perfis` já foi removida).
- *Consequências:* os relatórios e o histórico por cliente só enxergam `orders`; `pedidos` não tem `user_id`
  (nenhum cliente consegue ver os próprios pedidos feitos por ela); o RPC `criar_pedido` grava na tabela antiga;
  só a tabela antiga tem variantes (P/G), extras, ponto da carne e "valor a confirmar", que o site usa.
- *Correção:* decidir entre **(A)** migrar o antigo para o novo (recomendado: acrescentar variantes, extras,
  ponto da carne e preço opcional ao modelo novo, trazer os dados e apagar as tabelas em português),
  **(B)** manter os dois, **(C)** ficar só com o antigo. A proposta 006 já prepara a opção A (item A4).

**A2. Funções públicas `criar_pedido` e `criar_contato` sem nenhum limite**
- *Evidência (testada):* um visitante anônimo criou **300 contatos e 60 pedidos em sequência**, sem nenhuma recusa.
  Isso enche o banco de lixo e polui o painel da loja. O limite de "20 pedidos por hora" só existe em `orders`
  (por usuário logado), não nas funções públicas.
- *Correção:* (1) exigir login: `revoke execute ... from anon` (item 9 da proposta, opcional porque o site atual não
  tem login); ou (2) chamar essas funções de uma Route Handler do Next com limite de requisições
  (Vercel Firewall) e captcha; ou (3) ao migrar para o modelo novo (A1), os pedidos passam a exigir conta.

**A3. Taxa de entrega e desconto nunca podem ser definidos**
- *Evidência:* em `orders`, o admin só edita `status`, `payment_method` e `notes` (conforme a especificação), e o
  cliente nunca define valores. Logo `delivery_fee_cents` e `discount_cents` ficam sempre em 0, e o total é sempre o
  subtotal. O faturamento nunca terá taxa de entrega nem desconto.
- *Correção (proposta 006, item 6):* função `admin_set_order_amounts(order_id, taxa, desconto)`, só para admin, só em
  pedido pendente ou confirmado, que recalcula o total. Testada: valor negativo, desconto maior que o pedido, pedido
  já entregue, cliente e anônimo são recusados.

**A4. O gatilho de pedidos impede importar histórico**
- *Evidência (testada):* `orders_prepare` zera status e valores **até quando quem insere é o dono do banco**. Não dá
  para trazer os pedidos antigos (`pedidos`) com data e status originais.
- *Correção (proposta 006, item 5):* as travas passam a valer só para `anon` e `authenticated` (a API do site);
  `postgres` e `service_role` conseguem importar. Os itens importados exigem nome e preço informados.

### Médio

**M1. Login com Apple: nome em formato de objeto vira texto JSON**
- *Evidência (testada):* `{"name": {"firstName":"João","lastName":"Pedro"}}` gravou
  `full_name = '{"lastName": "Pedro", "firstName": "João"}'`. Google (`full_name` e `name` em texto) e Apple sem nome
  funcionam; e-mail com senha também.
- *Correção (proposta 006, item 3):* aceita texto ou objeto e monta "João Pedro". Testada nos 4 formatos.

**M2. Nome do perfil sem limpeza**
- *Evidência (testada):* caractere de inversão de texto (U+202E) fica gravado, tanto no cadastro quanto quando o
  cliente edita o próprio nome. O React escapa na tela, mas e-mail, WhatsApp e exportações não.
- *Correção (proposta 006, item 4):* gatilho `profiles_clean` aplica `clean_text` a cada inserção ou edição do nome.

**M3. Duas chaves estrangeiras sem índice** (tabelas antigas)
- `pedido_itens(produto_id)` e `pedido_item_extras(extra_id)`. Sem índice, apagar um produto ou extra varre a tabela inteira.
- *Correção (proposta 006, item 1):* criar os dois índices.

**M4. "Meus pedidos" sem índice composto**
- Hoje há índices separados em `orders(user_id)` e `orders(created_at desc)`. A listagem do cliente
  (`where user_id = ? order by created_at desc`) pede `(user_id, created_at desc)`.
- *Correção (proposta 006, item 1):* criar o composto e remover o antigo.

**M5. `orders.user_id` sem valor padrão**
- O cliente precisa enviar o próprio id (e a RLS confere). Isso é desnecessário e convida a tentativas de forjar.
- *Correção (proposta 006, item 2):* `default auth.uid()` e fechar a coluna para escrita direta.
  Testado: sem enviar, o `user_id` é o do login; enviar o próprio id ou o de outra pessoa é recusado.

**M6. Login anônimo (se for ligado no Auth) conta como `authenticated`**
- Hoje `enable_anonymous_sign_ins = false` (correto). Se um dia for ligado, essas contas poderiam fazer pedidos.
- *Correção (proposta 006, item 7):* a política de criação de pedido exige `is_anonymous = false` no JWT. Testada.

**M7. LGPD: dados pessoais permanecem depois que a conta é apagada**
- `orders.user_id` vira `null` (histórico fica), mas `customer_name`, `customer_phone`, `notes` e o endereço de
  entrega continuam.
- *Correção (proposta 006, item 8):* função `anonymize_orders_of(user_id)`, só para `service_role`, para chamar
  no fluxo de exclusão de conta. Testada. Falta também definir o prazo de retenção e escrevê-lo na política de privacidade.

**M8. Configuração do Auth (`supabase/config.toml`) ainda é a de desenvolvimento**
- `site_url = "http://127.0.0.1:3000"` e `additional_redirect_urls` locais; para produção: `https://mdogao.com.br`.
- `[auth.email] enable_confirmations = false`: cadastros por e-mail sem confirmação (contas com e-mails de terceiros).
- `minimum_password_length = 6` (sugestão: 8 ou mais).
- Só existe o bloco `[auth.external.apple]` (desligado, `client_id` vazio) e **não há bloco do Google**. Para ligar os
  dois: `enabled = true`, `client_id` e `secret = "env(...)"`. **Nunca commite o segredo.** O Apple exige gerar
  o segredo (JWT) a partir da chave `.p8`, que vence a cada 6 meses.
- No console de cada provedor, o endereço de retorno é `https://<projeto>.supabase.co/auth/v1/callback`.

**M9. Do lado do app (não são migrações, mas bloqueiam o login Google/Apple)**
- Não existe rota de retorno do OAuth (`app/auth/callback`, que chama `exchangeCodeForSession`) nem `proxy.ts` para
  renovar a sessão. Você pediu para não mexer em rotas, então só registro.
- `Cross-Origin-Opener-Policy: same-origin` quebra login em **popup** (Google One Tap, Apple JS). Com redirecionamento
  normal funciona; se usar popup, trocar para `same-origin-allow-popups`.
- CSP: `img-src 'self' data: blob:` bloqueia a foto de perfil do Google (`lh3.googleusercontent.com`) e imagens de
  produto do Storage do Supabase (`<projeto>.supabase.co`). `next/image` precisaria de `remotePatterns` também.
- Cookies: o Supabase grava cookies de sessão (`sb-...`). A política de cookies hoje diz que o site não usa cookies
  próprios, o que deixará de ser verdade com o login. Atualizar as políticas de privacidade e de cookies.

### Baixo

| # | Ponto | Observação |
|---|---|---|
| L1 | Funções auxiliares (`clean_text`, `limpar_texto`, gatilhos) executáveis por `anon` | Inofensivas. **Não revogar** `clean_text`: os gatilhos a chamam com as permissões de quem insere e quebrariam. |
| L2 | `handle_new_user` usa `search_path = public` (o resto usa vazio) | Foi o requisito da 001; todas as referências são qualificadas, sem risco real. |
| L3 | `[db.seed] enabled = true` aponta para `supabase/seed.sql`, que não existe | Criar um `seed.sql` vazio ou desativar. |
| L4 | Tabelas antigas com política redundante (`*_leitura_equipe` + `*_admin for all`) | Some ao consolidar (A1). |
| L5 | Admin apaga `pedidos`/`contatos` antigos, mas não `orders` | Inconsistência entre os dois modelos. |
| L6 | `products.image_url` aceita qualquer `https://` | Admin-controlado; restringir ao host do Storage quando ele existir. |
| L7 | Produto de categoria inativa continua visível e comprável | Decidir a regra. |
| L8 | Relatórios contam `pending` como venda e não incluem `pedidos` antigos | Documentado; trocar o filtro se preferir só `delivered`. |
| L9 | Versões mistas (`001`–`005` e timestamps) | Funciona (a CLI ordena pelo número), mas é frágil. Padronizar com timestamps ao consolidar. |

---

## 3. O que está correto (verificado)

- **RLS ligado em 17 de 17 tabelas públicas.** Nenhuma política vale para `public` (todos os papéis); todas citam
  `anon` e/ou `authenticated`.
- **Matriz de acesso (conferida pelo catálogo do banco):**
  - `anon`: só `SELECT` em cardápio ativo, loja e horários (dos dois modelos). Nenhuma permissão em perfis, endereços, pedidos,
    contatos, itens nem relatórios.
  - `authenticated` (cliente): `SELECT`/`UPDATE (nome, telefone)` no próprio perfil; CRUD nos próprios endereços;
    cria e lê os próprios pedidos e itens; lê o cardápio ativo. Nada de escrita em cardápio, loja ou relatórios.
  - `authenticated` com `role = admin` (via `is_admin()`): lê tudo em perfis, endereços, pedidos, itens, relatórios;
    edita cardápio e loja; em `orders`, só `status`, `payment_method` e `notes`.
- **Views:** `sales_summary`, `monthly_sales` e `best_selling_products` com `security_invoker=true`, fuso
  America/Sao_Paulo, cancelados fora do faturamento, e filtro `is_admin()`.
- **Funções `SECURITY DEFINER`:** todas com `search_path` fixo; `handle_new_user` e `order_items_recalc` não são
  executáveis por `anon` nem `authenticated`.
- **Sequências** sem permissão para `anon`/`authenticated`.
- **Chaves estrangeiras com regra de exclusão coerente:** itens e extras em cascata; produto apagado vira `null` no
  item (o histórico fica com nome e preço); conta apagada vira `null` no pedido.
- **Segredos:** nenhum (chaves JWT, `sb_secret`, senhas, tokens). **UUID fixo:** nenhum. **Dados fictícios:** nenhum.
  O `20261104120008_dados_iniciais.sql` traz dados *reais e públicos* do negócio (cardápio de janeiro/2025,
  WhatsApp, e-mail, endereço), que o próprio site já mostra.
- **Histórico de pedidos:** `orders.user_id` + RLS própria; cada item guarda nome e preço da compra, imune a
  mudar ou apagar o produto (testado). Total sempre `subtotal + taxa − desconto` (CHECK).
- **Relatórios:** fuso, cancelados e ranking testados com valores reais (47 verificações).

### Ordem de execução (como a CLI aplica: pelo número da versão)

`001` perfis/endereços → `002` catálogo → `003` pedidos → `004` relatórios → `005` *(quebra, ver B1)* →
`20261104120001` tipos → `…0002` cardápio PT → `…0003` loja → `…0005` pedidos/contatos PT → `…0006` RLS PT →
`…0007` funções PT → `…0008` dados iniciais.

Dependências conferidas: 003 usa `is_admin` (001), `set_updated_at` e `products` (002); 004 usa `orders` e `order_items` (003);
`…0006` usa `is_admin` (001); `…0008` usa as tabelas da `…0002`. Sem dependência circular.

---

## 4. Plano sugerido (nesta ordem)

1. **Mover a 005** para `supabase/scripts/` (B1). Desbloqueia o `db push`.
2. **Decidir o banco duplicado** (A1): opção A, B ou C.
3. **Adotar a proposta 006** (já testada) como migração nova, renomeada com timestamp. Se o item 9 (fechar os RPCs
   para anônimos) fizer sentido depois da decisão A1, descomentar.
4. **Ajustar `config.toml`** (M8) e criar os apps de login no Google e na Apple.
5. **Preparar o app** (M9): callback do OAuth, `proxy.ts`, COOP/CSP e atualizar as políticas de privacidade e cookies.
6. **Só então** `supabase link` e `supabase db push`, depois do primeiro admin criado à mão.

## 5. Como foi verificado
- Aplicação das migrações em ordem num PGlite, com `anon`, `authenticated` e `auth.uid()` simulados.
- Auditoria pelo catálogo do Postgres: RLS, políticas, FKs com índice de apoio, permissões, views, funções, sequências.
- Simulação de cadastro com metadados de Google, Apple (com e sem nome, nome em objeto), e-mail com senha, login anônimo.
- Testes de comportamento (spam, limpeza de texto, importação, taxa, anonimização).
- Varredura de texto por segredos, UUIDs e dados fictícios.
- **Limites:** o PGlite não reproduz o Supabase 100%: não há PostgREST, GoTrue nem os privilégios padrão do ambiente real.
  Por isso a configuração do Auth (M8) e o comportamento real do login (M9) precisam de teste final num projeto Supabase de verdade.
