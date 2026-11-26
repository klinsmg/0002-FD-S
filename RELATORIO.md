# Relatório — melhorias de segurança, desempenho e interfaces

> **26/11/2026:** o rastreamento (GPS, mapas, rotas, Google Maps) descrito abaixo foi **removido** (migração
> `022_remove_rastreamento.sql`). A entrega com entregador continua: a loja direciona e o entregador dá baixa, sem
> localização. Este relatório fica como histórico.

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
Unitários 8/8 · banco 276/276 · HTTP 19/19.

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

---

## Fase 5 — Correção e hardening

### Correções (por severidade)
| # | Sev. | Correção | Teste de regressão | Em produção? |
|---|---|---|---|---|
| V1 | Alta | `is_admin()` exige `aal2` (2FA concluído) no JWT. Uma sessão só com senha (ou Google) não tem mais nenhum poder de admin na API do banco, no Realtime nem nas funções | `tests/db` seção 25 (5 checagens: lê, altera, libera entregador, auditoria; e admin aal2 continua funcionando) | **Sim** (migração 019 aplicada; conferido nos metadados) |
| V2 | Média | `access_check` só para `service_role`; o servidor (`lib/protecao.ts` + `lib/supabase/servico.ts`, com `server-only`) informa o IP real e o usuário verificado | seção 25 (anônimo e cliente recusados; servidor registra o usuário) | **Sim** (banco). Código: no próximo deploy |
| V3 | Baixa | `pg_advisory_xact_lock` por cliente no limite de 5 pedidos/dia | seção 25 | Sim |
| V4 | Baixa | `log_denied` só para `service_role` | seção 25 | Sim |
| V5 | Moderada | Next.js 16.4.4 → **16.4.6** (`npm audit`: 0 vulnerabilidades) | `npm audit` | No próximo deploy |
| V6 | Baixa | IP mascarado nos logs (`ipLog`) | — | No próximo deploy |
| extra | Baixa | Envio do e-mail de recuperação de senha do admin passa pelo mesmo limite do login (antes dava para disparar e-mails em série) | — | No próximo deploy |

Reversão: `supabase/rollback/019_down.sql` (testada no PGlite: desfaz, reaplica e V1 continua fechado — seção 26).
Backup das funções antes da mudança: `supabase/backups/20261119-fase5-funcoes-antes-019.json` (fora do git).

### Defesa em profundidade (situação final)
- **Autorização em toda rota:** todas as Server Actions validam a entrada e conferem a sessão/papel (admin: `exigirAdmin`
  com aal2 + senha; entregador: `entregadorAtual`; cliente: `usuarioAtual`); e o banco confere de novo (RLS + funções
  `security definer` com `search_path` vazio). Revisado arquivo por arquivo.
- **Rate limiting:** pedido, login do painel, 2FA, recuperação de senha (usuário + IP + aparelho), 5 pedidos/dia,
  1 posição de GPS a cada 3 s, limites do Supabase Auth.
- **Cabeçalhos:** CSP, HSTS (2 anos, preload), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy
  (só geolocalização do próprio site), COOP, sem X-Powered-By — com teste automatizado.
- **Senhas:** hash do Supabase Auth (bcrypt); senha do admin com mínimo de 12 caracteres; 2FA TOTP obrigatório e agora
  também no banco.
- **Logs de auditoria:** linha do tempo dos pedidos, confirmação de entrega com posição/precisão/distância, tentativas
  barradas, acessos negados ao GPS (tela `/admin/auditoria`).
- **Erros sem detalhes internos:** respostas com códigos curtos/mensagens genéricas; detalhes só no log do servidor.
- **LGPD:** aviso e consentimento do entregador antes do GPS; cliente vê só posição aproximada; retenção (GPS 30 dias com
  botão de limpeza; tentativas 7 dias); IP mascarado na tela e nos logs; política de privacidade e de cookies atualizadas.
- **Segredos:** chave secreta só no servidor (teste HTTP garante que nenhum JS servido contém segredo).

### Pendentes (média/baixa) com justificativa
| # | Sev. | Por que ficou | O que fazer |
|---|---|---|---|
| V8 | Média | CSP com `'unsafe-inline'`/`'unsafe-eval'`: exigido pelo Alpine (build padrão) e pela hidratação do Next. Trocar exige reescrever o carrinho | Migrar o carrinho para `@alpinejs/csp` + nonce por requisição |
| V7 | Baixa | O token de acesso (1 h) vai ao JS só para abrir o WebSocket autenticado; não há alternativa no Realtime do Supabase sem expor um JWT | Mitigado por V1 e pela CSP; manter |
| V9 | Baixa | GPS falsificado pelo próprio entregador é limite do modelo (o app roda no aparelho dele) | Futuro: prova de entrega (foto ou código dito pelo cliente) |
| V10 | Baixa | Configuração do painel do Supabase (não alterável com segurança pela CLI: `config push` sobrescreveria a configuração do Auth com a de desenvolvimento) | Desligar **Realtime › Settings › Allow public access** no painel |
| V11 | Info | Chave da Embed API é pública por desenho | Manter a restrição por domínio |

**Nenhuma vulnerabilidade crítica ou alta aberta.**

### Ação necessária no deploy
A Vercel precisa da variável **`SUPABASE_SERVICE_ROLE_KEY`** (chave secreta do Supabase). Sem ela o site funciona,
mas os limites de tentativa ficam desligados (o log avisa `[seguranca] SUPABASE_SERVICE_ROLE_KEY ausente`).

### Regressão
Unitários 8/8 · banco **291/291** · HTTP **20/20** · `npm audit` 0.

---

## Fase 6 — Inventário final

Gerado em **`INVENTARIO.md`**:
- Funções por perfil: Público (7), Cliente (9), Loja/Admin (22), Entregador (8), Sistema (36 funções/gatilhos do banco).
- 38 páginas/rotas com perfil de acesso e finalidade.
- 10 endpoints HTTP + 31 Server Actions + canais do Realtime + API REST do Supabase, com a autenticação exigida.
- README atualizado (antes descrevia o site antigo, sem banco nem login).

---

## Decisões tomadas sozinho (para revisão)
1. **Migrações aplicadas no banco de produção** (017, 018, 019), todas aditivas/compatíveis com o código no ar, com
   backup antes e script de reversão testado. A 019 fecha a vulnerabilidade alta (V1) imediatamente.
2. **Nada foi enviado ao GitHub nem publicado** (branch local `melhorias-seguranca-desempenho`, 6 commits).
3. **Destino aproximado → raio mínimo de 300 m** para confirmar a entrega (antes travava). Valor escolhido por
   segurança operacional; ajustável na migração.
4. **Limite de tentativas sem a chave secreta configurada deixa passar** (fail-open) para não derrubar pedidos/login;
   o limite diário do banco continua valendo. Configure `SUPABASE_SERVICE_ROLE_KEY` na Vercel.
5. **GSAP removido** do projeto (animação de entrada agora é CSS nativo; visual equivalente, sem travar o celular).
6. **Menu do admin reordenado** (Loja primeiro). **"Realizar pedido" escondido** em login, painel e entregador
   (mantido na área do cliente, onde ajuda a pedir de novo).
7. **"Ganhos" do entregador = soma das taxas de entrega** (não há cadastro de quanto cada entregador recebe).
8. **Recusa só antes de sair**; depois de sair, a devolução exige motivo (cliente ausente, endereço, outro).
9. **Horários passaram a vir do banco**, com `lib/info.ts` como reserva.
10. **Next 16.4.4 → 16.4.6** (patch de segurança).
11. Não alterei a configuração do Realtime/Auth no painel do Supabase (V10): `config push` sobrescreveria a configuração
    de produção com a de desenvolvimento.

## Pendências que dependem de você
- **Deploy** (merge da branch na `main`): o banco de produção já está à frente do código no ar desde as migrações
  012–016; até o deploy, a loja em produção não consegue despachar nem finalizar entregas.
- Variáveis na Vercel: `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_SERVER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`
  (passo a passo no `.env.example`).
- Painel do Supabase: desligar **Realtime › Allow public access** (V10).
- Teste manual dos fluxos logados (painel, entregador no celular, mapa do cliente): não havia conta de teste.

## Números finais
| | Início | Fim |
|---|---|---|
| Testes automatizados | 244 checagens de banco fora do repo | **291 banco + 8 unitários (9 testes) + 20 HTTP**, no repo (`npm test`, `npm run test:http`) |
| Vulnerabilidades | 1 alta, 2 médias, 4 baixas, 1 moderada (npm) não identificadas | **0 críticas, 0 altas abertas**; 1 média e 3 baixas pendentes com justificativa |
| `npm audit` | 1 moderada | **0** |
| INP do cardápio (celular) | 5.600 ms | **24 ms** |
| JS por página | 219 KB | **174 KB** |

## Pós-entrega (22/11/2026): verificação das chaves em produção
- `SUPABASE_SERVICE_ROLE_KEY`: ok (banco aceita a chamada exclusiva do servidor); nenhum segredo nos JS servidos.
- `GOOGLE_MAPS_SERVER_KEY`: Routes API ok; **Geocoding API recusada pelo Google ("enable Billing")**. Ajuste: `lib/geo.ts`
  passa a geocodificar pela Routes API quando a Geocoding recusa (correspondência parcial só aceita se for o CEP, senão
  descarta; resultado marcado como aproximado se não for endereço exato). Teste: `tests/unit/geo.test.mjs` (5 casos).
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`: presente no build. **Correção:** o teste anterior ("carrega o mapa") só
  detectava erro de autenticação; o console mostra `BillingNotEnabledMapError` em todos os sites, inclusive produção.
  A restrição por site só pode ser verificada depois do faturamento ativo.
- Após o ajuste das restrições (22/11, 18h): a Routes API também passou a recusar (403 PERMISSION_DENIED por 6 min
  seguidos). Conclusão: **o projeto do Google Cloud está sem faturamento ativo**; nenhuma API do Maps funciona sem ele
  (a resposta 200 da Routes no primeiro teste foi passageira).
- ETA passa a ser **sem trânsito** (`TRAFFIC_UNAWARE`, faixa Essentials da Routes API, cota grátis maior que a Pro) e
  recalculado **no máximo a cada 2 min** por entrega (antes: com trânsito, a cada 45 s). Texto do mapa do cliente ajustado.

## Reestruturação do rastreamento (23/11/2026)

Pedidos aplicados, em ordem: (1) rastreamento self-hosted, sem API de terceiros; (2) Google Maps Platform como camada
opcional com cota, cache e fallback; (3) regra "GPS barato e frequente / rota do Google rara / OSRM sempre disponível /
mapa uma vez por sessão / ETA local"; (4) testes de segurança sem as variáveis de mapas/Google.
Arquitetura completa: `docs/arquitetura-rastreamento.md`. VPS: `infra/README.md`.

### Decisões (escolhidas pelo dono nas perguntas)
- **Base mantida** (Next.js + Supabase na Vercel); só o que dependia do Google foi para a infra própria. Os endpoints do
  prompt viraram Route Handlers com o mesmo contrato; `POST /api/auth/login` e `POST /api/orders` continuam pelo Supabase
  Auth e pela Server Action do checkout (já aprovados; duplicar abriria outra porta de entrada).
- **VPS ainda não existe**: entregue `infra/` (docker-compose, Nginx, Let's Encrypt, script de dados) e o site segue
  funcionando sem ele (ETA local, mapa simplificado, coordenadas coladas pela loja).
- **Endereço**: Nominatim próprio sugere e o cliente pode arrastar o pino no checkout (opcional).
- **Uma loja**, com `restaurants`/`restaurant_members` e RLS "só vê os próprios pedidos" prontos.

### Decisões tomadas sozinho (para revisão)
- **PostGIS não usado**: o `distance_m` (Haversine) já resolve uma loja; PostGIS quebraria o banco de testes (PGlite).
- **Tabelas com os nomes já em produção**: `delivery_positions` (= courier_locations) e `order_events` (= tracking_events).
- **Mapa no navegador**: Leaflet + protomaps-leaflet (PMTiles vetorial no canvas, sem fontes/sprites para hospedar).
  Carregado sob demanda: fora do JS inicial de todas as páginas.
- **Mapa Google sem a chave no navegador**: em vez do Maps JavaScript API (que exige a chave no front), tiles do Map Tiles
  API pelo nosso proxy `/api/maps/tiles` com link assinado (HMAC, 2 h). Antes de ligar, confira os termos do Google sobre
  exibir o logo/atribuição (hoje só texto "Dados do mapa © Google").
- **Routes API sem trânsito** (Essentials) também no Google, mantendo a decisão de 22/11 (cota grátis maior).
- **GPS a cada 15 s** (antes 7 s em movimento / 25 s parado), como pede o prompt.
- **Pedido de teste** = nome do cliente com "teste" (não há marca de teste no banco). **Rascunho** = status `pending`.
- **Limites novos**: `gps` 20/min por entregador/aparelho (bloqueio de 2 min, para não cegar uma entrega) e `mapas`
  40 por 10 min por usuário.
- **Chave do Embed separada** (`GOOGLE_MAPS_EMBED_KEY`): com o Google ligado, `GOOGLE_MAPS_API_KEY` é a chave secreta e
  nunca vai ao HTML do mapa de contato (o nome antigo só vale com o Google desligado).
- `lib/geo.ts` (Google Geocoding/Routes de 22/11) removido; as variáveis `GOOGLE_MAPS_SERVER_KEY` e
  `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` não são mais usadas (podem ser apagadas na Vercel).

### Testes
| Suíte | Antes | Agora |
|---|---|---|
| Banco (PGlite) | 293 | **356** (020/021: loja padrão, destino do pedido, equipe da loja só leitura e só da própria loja, rota com provedor, código antigo com 4 parâmetros, cache só servidor, limite do GPS, reserva atômica, avisos 70/85/95/100%, bloqueio, consolidação, rollback 020/021) |
| Unitários | 9 | **34** (25 do rastreamento: polyline, desvio, ETA local, gatilhos, cache, Google com cota, fallback para OSRM sem cota/erro/timeout, estimativa, sem Google, sem VPS, elegibilidade, entrega de 20 min com GPS a cada 15 s → 1 chamada ao Google, map matching, mapa 1x por sessão, HMAC, Nominatim) |
| HTTP (servidor local) | 8 grupos | **17 grupos, 29 testes** |
| Nginx do VPS (container local) | — | **20 checagens** |
| Sondagem de segurança (script + curl) | — | **45** |

### Testes de segurança (sem variáveis de mapas/Google, servidor local)
Tudo passou depois das correções abaixo:
- CSRF: Origin ausente, `null`, de outro site, com sufixo enganoso ou outra porta → 403 em todas as mutações.
- Corpo: JSON inválido/array → 400; > limite, Content-Length mentiroso e chunked de 50 KB → 413; `__proto__` sem efeito;
  NaN/Infinity, precisão negativa e timestamp inválido no GPS → 400.
- IDs maliciosos (SQL, traversal, NUL, 500 caracteres) → 400/401/404, sem erro interno; tiles com z/x/y fora da grade → 400;
  token de tile forjado/adulterado/vencido → 403.
- Métodos errados → 405; admin sem 2FA ou não-admin → 404 genérico; SSE sem login não abre stream; cron sem segredo → 401.
- Nenhum segredo/chave (`AIza…`, `sb_secret_`, `service_role`, `MAPAS_TOKEN`…) em **nenhum** JS do build, inclusive os
  carregados sob demanda; `/api/maps/base` só devolve URLs.
- CSP sem domínios do Google em script/img/connect.
- Nginx do VPS: OSRM/Nominatim → 403 sem token, com token errado ou vazio, e em métodos diferentes de GET; só `*.pmtiles`
  servidos (o `.osm.pbf` → 404, traversal → 404/400); CORS só do site; corpo > 4 KB → 413.

Achados no trabalho e já corrigidos:
| # | Gravidade | Achado | Correção |
|---|---|---|---|
| R1 | alta (funcional) | Políticas novas (equipe da loja) entravam em recursão infinita: toda leitura de pedidos quebraria | Função `is_order_restaurant_member` (security definer) |
| R2 | média | SSE segurava uma função por 55 s sem limite: uma conta abriria dezenas de conexões | Limite `mapas` na abertura |
| R3 | média (configuração) | Nome `GOOGLE_MAPS_API_KEY` era o da chave pública do Embed: ligar o Google com a chave de servidor ali a exporia no HTML | `GOOGLE_MAPS_EMBED_KEY`; o nome antigo só vale com o Google desligado |
| R4 | baixa | `config` do mapa podia ser pedido em série para gastar a cota de carregamentos | 1 `map_load` por pedido a cada 2 h (+ limite `mapas`) |
| R5 | baixa | `/api/maps/base` (público) consultava o banco a cada acesso | Cache de CDN (`s-maxage=300`) |
| R6 | baixa (funcional) | Gatilho do canal não publicava rota nova gravada no mesmo milissegundo | Publica também quando rota/provedor mudam |

Riscos aceitos/pendentes:
- Link de tiles do Google pode ser repassado por até 2 h: no máximo consome a cota (o teto impede cobrança).
- `too_far` (pino a > 50 km) só vale depois que o ponto da loja for cadastrado em **Admin → Mapas**.
- GPS falsificado pelo próprio entregador (V9) e CSP com `unsafe-inline`/`unsafe-eval` (V8) continuam como antes.
- Token do VPS é um segredo fixo compartilhado: troque se vazar (passo a passo no `infra/README.md`).

### Não testado (e por quê)
- **OSRM/Nominatim/PMTiles com dados reais**: o extrato do Brasil tem ~2 GB e a importação do Nominatim leva horas; os
  provedores foram testados com respostas no formato real e o Nginx num container local. Testar no VPS ao subir.
- **Telas logadas no navegador** (mapa do pedido, pino, Admin → Mapas): sem contas de teste, como antes.
- **Migrações 020/021 aplicadas em produção em 23/11/2026**, depois do backup completo (esquema + dados em
  `supabase/backups/20261123-141918-pre020-*.sql`). Os 9 pedidos existentes ficaram ligados à loja padrão; os tipos
  (`lib/database.types.ts`) foram regenerados do banco; o Security Advisor não aponta nada novo de nível ERROR.

