# Relatório — melhorias de segurança, desempenho e interfaces

Branch: `melhorias-seguranca-desempenho` (um commit por fase; nada foi enviado ao GitHub nem publicado).
Projeto: MDogão Itapevi — Next.js 16 + Supabase (Postgres, Auth, Realtime) na Vercel.

## Contexto e limites desta execução

- **Perfis existentes:** Cliente (público + conta), Loja/Admin (o painel `/admin` é o mesmo perfil: a loja é única, então
  "Loja" e "Admin" são o mesmo usuário com papel `admin`) e Entregador (`/entregador`). Não existe multi-loja nem
  pagamento online (o pagamento é combinado e registrado pela loja: dinheiro, Pix, cartão).
- **Sem Docker** nesta máquina: não há Supabase local. Por isso:
  - testes de banco (RLS, funções, gatilhos, fluxos, ataques de autorização) rodam no **PGlite** (Postgres em memória)
    com todas as migrações do projeto — nunca no banco real;
  - testes HTTP rodam no servidor **local** (`next start`), só com GETs de visitante e requisições recusadas antes do banco;
  - nenhum teste de vulnerabilidade ou de carga foi feito contra produção.
- **Migrações no banco de produção:** foram aplicadas apenas migrações aditivas e compatíveis com o código no ar, sempre
  com backup antes (`supabase/backups/`, fora do git) e script de reversão (`supabase/rollback/`).
- **Atenção (herdado da sessão anterior, não resolvido aqui porque deploy está fora do escopo):** as migrações 012–016
  já estão no banco de produção, mas o código no ar ainda é o anterior. Enquanto o deploy não for feito, a loja em
  produção não consegue despachar nem finalizar pedidos de entrega (o banco agora exige o despacho com entregador).

---

## Fase 1 — Testes funcionais

### Mapeamento
Rotas, páginas, ações e funções foram levantadas (lista completa em `INVENTARIO.md`, Fase 6):
38 páginas/rotas, 11 arquivos de Server Actions (31 ações), 9 Route Handlers, 39 funções/gatilhos no banco.

### Testes criados / organizados
| Suíte | Arquivo | Como roda | O que cobre |
|---|---|---|---|
| Unitários | `tests/unit/regras.test.mjs` | `npm test` | fluxo de status, centavos, endereço, distância, ETA de reserva, posição aproximada |
| Banco (integração + E2E) | `tests/db/banco.test.mjs` | `npm test` | 23 seções: catálogo, pedidos, RLS por perfil, admin, relatórios, endereços, avaliações, fluxo de status, tempo real, limites, entregas, rastreio, **fluxos ponta a ponta**, rollback |
| HTTP | `tests/http/rotas.test.mjs` | `npm run test:http` (servidor local ligado) | páginas públicas, proteção das áreas logadas, APIs de visitante, travas da API de GPS, cabeçalhos de segurança, cache |

O harness do banco estava fora do repositório (pasta temporária); foi trazido para `tests/db` com o PGlite como
dependência de desenvolvimento (`@electric-sql/pglite@0.5.15`).

Fluxos ponta a ponta cobertos (seção 21 do teste de banco):
pedido do cliente (preço do banco) → loja prepara e registra pagamento → Pronto → despacho para entregador →
GPS do entregador → confirmação no endereço → pedido Entregue → faturamento aparece no relatório; e retirada
(Novo → Em preparo → Pronto para retirada → Retirado).

### Resultado
| | Antes | Depois |
|---|---|---|
| Checagens de banco | 244 (fora do repo) | **262 ok / 0 falhas** |
| Testes unitários | 0 | **7 ok / 0 falhas** |
| Testes HTTP | 0 | **19 ok / 0 falhas** |
| Cobertura `lib/regras.ts` | — | linhas 100%, funções 100%, ramos 87% |
| Funções do banco exercitadas | — | 39/39 (21 chamadas por nome; 18 gatilhos exercitados pelos fluxos) |

### Bugs encontrados e corrigidos
1. **Pedido de entrega podia travar para sempre** (média). Quando o Google localiza o endereço só pelo CEP/região, o ponto
   pode ficar a centenas de metros da casa; o entregador nunca chegava a 50 m e não havia como finalizar.
   Correção: migração `017_destino_aproximado.sql` — o despacho grava se o destino é aproximado (`location_type` do Google
   diferente de ROOFTOP/RANGE_INTERPOLATED, ou busca só pelo CEP) e, nesse caso, o raio mínimo é 300 m. A auditoria do
   evento ENTREGUE registra o raio usado. O app do entregador avisa. Reversão: `supabase/rollback/017_down.sql`
   (testada no PGlite: desfaz e reaplica).
2. **Regras duplicadas** (fórmula de distância em 3 lugares, regras de fluxo misturadas com código de servidor): extraídas
   para `lib/regras.ts` (sem dependências), testáveis em Node puro.
3. **Comando de parar o servidor de teste** encerrava o próprio shell (o filtro casava com a linha de comando do shell);
   ajustado para filtrar só `node.exe`.

### Decisões
- Testes em `node:test` (nativo do Node 24, roda TypeScript sem build) em vez de adicionar Jest/Vitest.
- E2E de navegador com login não foi automatizado: exigiria criar contas e sessões no Supabase de produção (não há
  ambiente de dev). Os fluxos foram cobertos no nível do banco (onde estão todas as regras) e das rotas HTTP.

---

## Fase 2 — Desempenho web

### Como foi medido
`tests/perf/vitais.pw.js` (Playwright, servidor local `next start`): celular 390×844, **CPU 4× mais lenta**, rede 4G
(9 Mbps / 60 ms), cache desligado, 3 cargas frias por página (mediana). INP medido com um toque logo após a carga.
Bundle: soma dos chunks de `.next/static/chunks` (gzip). Banco: `supabase inspect db index-stats` (somente leitura).

### Baseline → depois
| Página | LCP (ms) | FCP (ms) | INP (ms) | CLS | TTFB (ms) | JS (KB transf.) | Total (KB) |
|---|---|---|---|---|---|---|---|
| `/` | 1680 → 1664 | 980 → 1048 | 24 → 24 | 0 | 62 | 219 → **174** | 483 → **438** |
| `/cardapio` | 2220 → **1904** | 1656 → **1372** | **5600 → 24** | 0 | 64 → 62 | 219 → **174** | 403 → **359** |
| `/contato` | 1376 → 1340 | 876 → 788 | 48 → 48 | 0 | 62 | 219 → **174** | 357 → **313** |
| `/entregador` | 1124 → 1076 | 544 → 552 | 40 → 32 | 0 | 62 | 219 → **175** | 355 → **311** |
| `/admin/login` | 1116 → 1088 | 592 → 572 | 40 → 48 | 0 | 62 | 220 → **175** | 358 → **313** |
| `/politica-de-privacidade` | 1340 → 1344 | 840 → 788 | 24 → 24 | 0 | 62 | 219 → **174** | 376 → **331** |

Bundle total do site: 31 chunks / 883 KB (290 KB gzip) → **29 chunks / 772 KB (246 KB gzip)**, −15%.

### O que foi otimizado
1. **Travamento de 4 s no cardápio (INP 5,6 s → 24 ms).** Uma tarefa longa de 4.152 ms no GSAP ScrollTrigger: os 238
   itens com animação de entrada ganhavam um gatilho cada, que media o layout de todos de uma vez. Além disso, um
   `ResizeObserver` recalculava tudo a cada filtro. Troquei pela solução nativa: `IntersectionObserver` que só adiciona
   uma classe e transição CSS (respeita `prefers-reduced-motion`; sem JS nada fica escondido). **A biblioteca GSAP
   saiu do projeto** (−26 KB gzip em todas as páginas).
2. **Busca do cardápio com debounce de 150 ms** (`x-model.debounce`, nativo do Alpine): não reavalia os 238 itens a cada tecla.
3. **Code splitting já correto:** o cliente do Realtime (WebSocket) só carrega nas páginas de pedido e no painel
   (verificado: `realtime=false` em todas as páginas públicas); Alpine e carrinho continuam carregados sob demanda.
4. **Banco:** nenhuma varredura sequencial em produção (todas as consultas usam índice); tabelas pequenas. Listas com
   paginação (pedidos do cliente: 15/página; pedidos do admin: paginados; quadro: 150 abertos + 40 encerrados do dia).
   Índices "sem uso" são de chaves estrangeiras (usados em exclusões/joins) e foram mantidos.

### Já estava bom (sem mudança)
TTFB ~62 ms local; CLS 0 em todas as páginas; imagens via `next/image` (AVIF/WebP, tamanhos fixos, lazy);
fontes via `next/font`; cache de CDN em mídias; compressão gzip/brotli pelo Next/Vercel.

### Limites conhecidos (registrados, não alterados)
- O painel (`/admin`) agrega os KPIs no servidor lendo até 5.000 linhas por período. Com o volume atual (9 pedidos)
  é instantâneo; acima de ~50 mil pedidos/mês vale trocar por uma view agregada no banco.
- Medição local não inclui a CDN da Vercel; em produção o TTFB das páginas estáticas tende a ser menor.

### Regressão
Fase 1 rodada de novo: unitários 7/7, banco 262/262, HTTP 19/19.

---

## Fase 3 — Interfaces (Loja/Admin, Entregador, Cliente)

> Limite de verificação: as telas logadas (painel, app do entregador, conta) não puderam ser abertas no navegador,
> porque não há conta de teste nem ambiente de dev (criar conta/sessão no Supabase de produção ficou fora do escopo
> autônomo). Elas foram validadas por tipos (`tsc`), build, testes do banco das regras que exibem e revisão do código;
> as telas públicas e de login foram verificadas no navegador em 390 px e 1366 px (sem rolagem horizontal; alvos de toque ≥ 24 px).

### Entregador (uso em campo, celular)
| Antes | Depois |
|---|---|
| Sem como recusar um pedido nem devolver uma entrega que não deu certo: o pedido ficava preso em "Saiu para entrega" | **Aceitar ou recusar** antes de sair; depois de sair, **"Não consegui entregar"** com motivo (cliente ausente, endereço não encontrado, outro). O pedido volta para "Pronto", a loja é avisada na hora e despacha de novo ou cancela (migração `018`, testada: 14 checagens) |
| GPS ligava sozinho ao abrir a entrega (o que também impediria a recusa) | O GPS liga ao **aceitar**; se a entrega já estava em andamento (ex.: recarregou a página), religa sozinho |
| Sem visão de produção | **Resumo**: entregas de hoje, dos últimos 7 dias e soma das taxas de entrega (7 dias) |
| Endereço localizado só pelo CEP travava a confirmação | Aviso "endereço aproximado" e raio de 300 m (Fase 1) |
| Checkbox "Manter conectado" com alvo de toque pequeno | Alvo ≥ 44 px |

### Loja / Admin
- **Menu reorganizado pela ordem de uso no dia a dia:** Loja (quadro) → Pedidos → Painel → Produtos → Categorias →
  Relatórios → **Auditoria** (nova) → Configurações.
- **Horário de funcionamento editável** (Configurações › Horários): antes só existia no código (`lib/info.ts`). Agora o
  site (início, contato, rodapé) lê do banco e as páginas continuam estáticas: ao salvar, elas são regeradas. Se o banco
  falhar, usa o horário fixo. Fecha depois da meia-noite é detectado sozinho. Regra de agrupamento ("Segunda a sexta")
  testada em `tests/unit`.
- **Auditoria** (`/admin/auditoria`): linha do tempo dos pedidos (com distância/precisão da confirmação de entrega e
  motivos de devolução), tentativas barradas pelos limites de segurança (IP mascarado na tela) e o botão de **retenção
  LGPD** (apagar GPS com mais de 30 dias, com confirmação).
- **Quadro da loja:** pedido que voltou do entregador mostra o motivo ("Voltou da entrega: cliente ausente").
- **Produtos e Categorias:** busca **instantânea** (sem recarregar, ignora acentos, mensagem "Nada encontrado"),
  estado vazio claro, e o formulário de cadastro **recolhido** num botão "+ Adicionar" (abre sozinho ao editar ou quando
  há erro; animação de 220 ms que respeita `prefers-reduced-motion`).
- "Realizar pedido" no cabeçalho não aparece mais no login, no painel nem no app do entregador.

### Cliente
- Linha do tempo do pedido mostra "Trocando de entregador" / "a entrega não foi concluída; o pedido voltou para a loja".

### Acessibilidade e consistência
Foco visível (`:focus-visible`) já existia em links, botões e campos; os componentes novos reutilizam os tokens e
classes existentes (`btn`, `nota`, `canais`, `conta-tit`), usam `<details>`/`<fieldset>`/`<label>` nativos, `role="status"`
/`aria-live` nas mensagens, e todas as animações novas respeitam `prefers-reduced-motion`.

### Regressão
Unitários 8/8 · banco 276/276 · HTTP 20/20.

### Não feito nesta fase (registrado)
- "Ganhos" do entregador mostra a soma das **taxas de entrega** dos pedidos dele: o sistema não tem cadastro de quanto
  cada entregador recebe por corrida. Se houver regra de pagamento, dá para trocar a soma.
- Gestão de "usuários" além de entregadores (ex.: listar clientes) não foi criada: o painel não tem esse caso de uso hoje
  e listar dados de clientes sem necessidade vai contra a minimização da LGPD.
- Produtos em grade com foto (pedido antigo do bloco 15) ficou como tabela com busca: as fotos dos produtos ainda não
  estão cadastradas (`image_url` vazio).

---

## Fase 4 — Teste de vulnerabilidades

Ambiente: tudo local. Banco: PGlite com todas as migrações (ataques simulados por papel: anônimo, cliente, outro cliente,
entregador, outro entregador, admin com e sem 2FA, service_role). HTTP: servidor local. Nenhum ataque contra produção.
Varreduras: `npm audit`, histórico completo do git (padrões de chave Google, segredo/JWT do Supabase, chave privada,
senha), busca por sinks de XSS, endpoints de debug e logs.

### 4.1 Reteste das vulnerabilidades já conhecidas (`supabase/revisao/RELATORIO_REVISAO.md` + sessões anteriores)
| Item anterior | Situação | Evidência |
|---|---|---|
| B1 bootstrap de admin em `migrations/` | Corrigido | não existe mais |
| A1 tabelas duplicadas PT/EN | Corrigido | teste "nenhuma tabela em português" |
| A2 RPCs públicas sem limite (spam) | Corrigido | teste "freio/limite diário", `create_contact` com limite |
| A3 taxa/desconto impossíveis | Corrigido | testes `admin_set_order_amounts` |
| A4 gatilho impedia importar histórico | Corrigido | teste "postgres/service_role preservam status e data" |
| M1 nome do Apple em objeto | Corrigido | 3 testes "Apple" |
| M2 nome do perfil sem limpeza | Corrigido | gatilho `profiles_clean` + testes |
| M3/M4 FKs e "meus pedidos" sem índice | Corrigido | teste "toda chave estrangeira tem índice" |
| M6 login anônimo como cliente | Corrigido | teste "LOGIN ANÔNIMO não faz pedido" |
| M7 LGPD pós-exclusão de conta | Corrigido | `anonymize_customer_data` + testes |
| M9 callback/COOP/CSP/cookies | Corrigido | testes HTTP de cabeçalhos; cookies httpOnly |
| A2/bloco 10 força bruta | Corrigido | limites por usuário/IP/aparelho (testes seção 18) |
| L1, L2, L8, L9 | Aceitos (documentados na revisão) | — |
| L6 `image_url` com qualquer https | Mitigado | CSP `img-src` só libera o próprio site e domínios do Google |
| M8 config do Auth local | N/A em produção | a configuração real fica no painel do Supabase |

### 4.2 Achados novos
| # | Severidade | Achado | Como reproduzir | Impacto | Correção |
|---|---|---|---|---|---|
| **V1** | **Alta** | **2FA do admin não valia no banco.** `is_admin()` só olhava o papel; o 2FA (aal2) era conferido só nas telas do painel | Fazer login com e-mail/senha do admin direto na API pública do Supabase Auth (URL e chave publicável são públicas) → token aal1 → chamar a API REST: lê/altera todos os pedidos, libera entregador etc. Reproduzido no PGlite (teste V1: 4 falhas antes da correção) | Quem descobrir a senha do admin opera como admin **sem o código do autenticador** | `is_admin()` passa a exigir `aal2` no JWT (migração 019) |
| **V2** | **Média** | **Limite de tentativas confiava no IP informado por quem chama.** `access_check` era executável por `anon` e recebia o IP como parâmetro | `POST /rest/v1/rpc/access_check` com `p_action=login_admin` e o IP da loja, 16× → o IP da loja fica bloqueado no login do painel por 15 min (repetível). Também permite "trocar de IP" à vontade ao chamar direto | Negação de serviço do login do admin; burla do limite por IP | Só o servidor (service_role) chama, informando o usuário já verificado; `anon`/`authenticated` perdem a permissão (migração 019 + `lib/protecao.ts`) |
| **V3** | Baixa | **Corrida no limite de 5 pedidos/dia.** O gatilho conta e insere sem trava | Disparar vários `create_order` ao mesmo tempo com o 5º pedido pendente | Alguns pedidos acima do limite | `pg_advisory_xact_lock` por cliente no gatilho (migração 019) |
| **V4** | Baixa | **`log_denied` executável por qualquer conta** | Chamar a RPC em loop | Enche o log de segurança (ruído/armazenamento) | Só service_role (migração 019) |
| **V5** | Moderada (sem impacto aqui) | **Next.js 16.4.4** — GHSA-mfr8-8qww-v76h (vazamento de cache com `'use cache'`) | `npm audit` | O projeto não usa `'use cache'`/`unstable_cache` (0 arquivos), então não é explorável hoje | Atualizar para 16.4.6 (patch) |
| **V6** | Baixa | **IP completo nos logs da Vercel** (`[protecao] bloqueado`) | Ver logs | Dado pessoal em log sem necessidade (LGPD: minimização) | Mascarar o IP no log |
| **V7** | Baixa | **Token de acesso entregue ao JS para o Realtime** (`tokenTempoReal`) | Ler a resposta da Server Action | Com um XSS, o token (até 1 h) poderia ser usado na API. Sem o refresh token. | Aceito: é o mínimo necessário para o WebSocket autenticado; com V1 corrigido o token do admin sem 2FA não dá poderes; CSP restringe destinos |
| **V8** | Média (conhecida) | **CSP com `'unsafe-inline'` e `'unsafe-eval'`** | Cabeçalho CSP | Reduz a proteção contra XSS | Pendente com justificativa: exigido pelo Alpine (build padrão) e pela hidratação do Next; a saída é migrar o carrinho para `@alpinejs/csp` + nonce |
| **V9** | Baixa | **GPS falsificado pelo próprio entregador** (chamada direta com coordenadas inventadas) | Chamar `courier_report_position` com posições fabricadas coerentes | Confirmar entrega sem estar no local | Aceito (limite do modelo): velocidade/salto, horário, duplicadas e precisão são checados; auditoria guarda tudo. Evolução: prova de entrega (foto/código do cliente) |
| **V10** | Baixa (configuração) | **Realtime com acesso público ligado** (padrão do Supabase) | Painel do Supabase › Realtime › Settings | Canais públicos com o mesmo nome poderiam receber mensagens forjadas (não verificado contra produção) | Desligar "Allow public access" no painel (o site só usa canais privados) |
| V11 | Info | Chave da Maps **Embed** visível no HTML | Ver código-fonte do mapa | Por desenho da Embed API | Manter restrita por referenciador e só à Maps Embed API (instruções no `.env.example`) |

### 4.3 Verificado e sem problema
- **Segredos:** nenhuma chave/segredo no histórico do git; `.env*` nunca commitado; backups fora do git; a chave
  service_role não é usada no navegador.
- **Injeção SQL:** todo acesso ao banco é por PostgREST/RPC com parâmetros; nenhuma SQL montada com texto do usuário.
- **XSS:** os 4 `dangerouslySetInnerHTML` usam constantes do código; o JSON-LD escapa `<`; Alpine só com `x-text`.
- **CSRF:** Server Actions exigem mesma origem (Next); a API de GPS confere `Origin`; cookies `SameSite=Lax`; logout só por POST.
- **SSRF:** chamadas externas só para URLs fixas do Google/ViaCEP; otimizador de imagens sem `remotePatterns`.
- **Open redirect:** `/auth/callback` usa lista fixa de destinos.
- **IDOR / escalonamento** (testes de banco): cliente não vê pedido/rastreio/eventos de outro; entregador não vê nem
  mexe em entrega de outro; desativado perde acesso; cliente não usa funções de admin/entregador; ninguém publica no
  canal de tempo real; colunas de pedido protegidas (mass assignment bloqueado por GRANT por coluna).
- **Sessão:** cookies httpOnly + Secure (produção) + SameSite=Lax; JWT de 1 h com renovação; "manter conectado" opcional.
- **Upload:** não existe upload de arquivo. **Webhooks de pagamento:** não existem (sem pagamento online).
- **Endpoints de debug:** nenhum. **CORS:** rotas do Next sem CORS aberto.
- **CSV do relatório:** proteção contra injeção de fórmula.
