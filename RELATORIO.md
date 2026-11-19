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
