# Rastreamento de pedidos — arquitetura

Rastreamento **self-hosted**: mapa, rotas, ETA, map matching e endereços na infraestrutura própria. O Google Maps
Platform é uma camada **opcional** de qualidade, com cota rígida e fallback automático. O sistema funciona 100% sem ele
(e até sem o VPS de mapas, em modo simplificado).

## Princípios

| Peça | Regra |
|---|---|
| GPS do entregador | atualização local, barata e frequente (a cada 15 s): grava, valida e publica; **não** recalcula rota |
| Rota do Google | cálculo caro, raro e controlado: só em gatilho, no máximo a cada 2 min, com cache e cota |
| OSRM | fallback sempre disponível (e o padrão quando o Google está desligado) |
| Estimativa local | último recurso (Haversine × fator de ruas a 25 km/h): o rastreio nunca para |
| Mapa | carregado (e contado) uma vez por sessão de rastreamento (2 h por pedido) |
| ETA | estimada localmente no navegador entre recálculos (restante × velocidade recente + ETA da rota − tempo decorrido) |

## Decisões de arquitetura (e por quê)

O pedido original listava Express/NestJS, PostgreSQL/PostGIS próprio e React/Vite num VPS. Por decisão do dono, a base
**aprovada** foi mantida (Next.js + Supabase na Vercel: login, 2FA, pedidos, RLS, painel) e só o que dependia do Google
passou para a infraestrutura própria. Equivalências:

| Pedido | Aqui |
|---|---|
| JWT com papéis customer/restaurant/courier/admin | JWT do Supabase Auth; papéis no banco: `profiles.role` (customer/admin, admin exige 2FA `aal2`), `couriers`, `restaurant_members` |
| Backend Express/NestJS | Route Handlers do Next (`app/api/**`) + funções `security definer` do Postgres |
| WebSocket ou SSE | Supabase Realtime (WebSocket, canal privado `pedido:<id>`) na página; SSE em `/api/orders/:id/tracking-stream` |
| PostGIS | não usado: distâncias com `distance_m` (Haversine) no banco; a escala (1 loja) não precisa de índice espacial e o PostGIS quebraria o banco de testes (PGlite) |
| users / couriers / deliveries / orders / restaurants | `auth.users`+`profiles`, `couriers`, `deliveries`, `orders`, `restaurants` (+ `restaurant_members`) |
| courier_locations / tracking_events | `delivery_positions` / `order_events` (nomes já em produção) |
| POST /api/auth/login | Supabase Auth (Google para cliente/entregador; e-mail+senha+TOTP para o admin em `/admin/login`) |
| POST /api/orders | Server Action `createOrder` (checkout): preços, totais e limites recalculados no banco |
| Vários restaurantes | estrutura pronta (tabela, papel, RLS "só vê os próprios pedidos"); cardápio e checkout continuam de uma loja |

## Componentes

```
Navegador ── Next.js (Vercel) ───────────── Supabase (Postgres + RLS + Realtime)
   │            │  app/api/**  lib/mapas/**        020: restaurants, destino, rota, route_cache, limites gps/mapas
   │            │                                  021: google_api_usage / _calls / _alerts, google_reserve/consolidate
   │            ├── X-Mapas-Token ──► VPS (infra/): Nginx ─► OSRM (rota, ETA, /match) · Nominatim (endereço)
   │            └── (opcional) ─────► Google Routes API · Map Tiles API (chave só no servidor)
   └── PMTiles (Range) ─────────────► VPS /tiles/regiao.pmtiles (CORS só do site)
   └── tiles Google (opcional) ─────► /api/maps/tiles/* (nosso proxy, link assinado HMAC)
```

### Provedores (`lib/mapas/provedores.ts`)

- `RoutingProvider` → `OsrmRoutingProvider` (padrão), `GoogleRoutingProvider` (opcional), `EstimativaRoutingProvider`.
- `MapProvider` → `SelfHostedMapProvider` (Leaflet + PMTiles), `GoogleMapProvider` (tiles via proxy). O navegador recebe
  só `MapaConfig` (provedor, URL, atribuição, fallback); **nunca a chave**.

### Serviço (`lib/mapas/servico.ts`)

`calcularRota()`: cache → [Google se permitido + cota] → OSRM → estimativa. Cada cálculo vai para `google_api_calls`
(provedor, status, latência, pedido, restaurante, entregador); trocas de provedor ficam como `fallback:<motivo>`.

Google permitido (`googlePermitido`) só se **todos**: `GOOGLE_MAPS_ENABLED=true` com chave válida; pedido em andamento
(não rascunho/pending, cancelado, entregue, nem de teste — nome com "teste"); restaurante com Google ligado; plano em
`GOOGLE_MAPS_PLANS`; pedido dentro do percentual do restaurante (fração estável pelo id); horário de pico
(`GOOGLE_MAPS_PEAK_HOURS`); e o recálculo veio de um gatilho real.

### Quando recalcular (`lib/regras.ts: deveRecalcular`)

1. Primeira rota (despacho: loja → cliente) — pode usar Google.
2. Nunca antes do intervalo (`GOOGLE_ROUTE_RECALC_INTERVAL_MINUTES`, padrão 2 min) por entrega.
3. Gatilhos (podem usar Google): pedido manual do cliente ("Atualizar previsão"), entregador começou (virou "a caminho"),
   desvio > 150 m da rota, a menos de 800 m do destino.
4. Sem gatilho, depois do intervalo: recálculo periódico **só no OSRM**.

A origem é a posição encaixada nas ruas (OSRM `/match` com as últimas 8 posições) e arredondada (~100 m), igual à
mostrada ao cliente. Cache por origem/destino arredondados + modo + janela de 15 min, expira em
`GOOGLE_ROUTE_CACHE_TTL_MINUTES` (5–15, padrão 10).

## Custos e limites (Google)

Cotas mensais por SKU, **abaixo** da cota grátis (confira a tabela atual do Google Maps Platform):

| SKU | Variável | Padrão | Uso |
|---|---|---|---|
| `routes` | `GOOGLE_MAPS_MONTHLY_ROUTE_CAP` | 10.000 | Routes API, Essentials (`TRAFFIC_UNAWARE`) |
| `map_load` | `GOOGLE_MAPS_MONTHLY_MAP_CAP` | 10.000 | 1 por pedido por sessão de rastreamento |
| `map_tiles` | `GOOGLE_MAPS_MONTHLY_TILE_CAP` | 100.000 | tiles 2D pelo proxy |

- **Reserva antes de chamar** (`google_reserve`, atômica com trava da linha do mês): `ok` consome 1; `soft` (≥ 95%,
  `GOOGLE_MAPS_SOFT_LIMIT_PCT`) → OSRM sem consumir; `blocked` (teto) → nada de Google até o próximo ciclo (mês do
  faturamento do Google, fuso do Pacífico). Sem a chave secreta do Supabase, o Google fica bloqueado (nunca gasta sem contar).
- **Avisos** de 70/85/95/100% em `google_api_alerts` (painel **Admin → Mapas** e log do job).
- **Job diário** (Vercel Cron, `vercel.json` → `/api/cron/mapas`, `CRON_SECRET`): reconcilia o contador com o registro,
  gera avisos e apaga chamadas > 90 dias e cache vencido.
- Estimativa de uso de rotas: ~1–3 chamadas Google por entrega (início + gatilhos) → ~3.000–10.000 entregas/mês na cota.
- Painel: uso atual, cota restante, chamadas por dia, por pedido, por restaurante, por entregador, custo estimado e provedor.

## Ativar e desativar o Google

**Ativar** (Vercel → Settings → Environment Variables, depois Redeploy):

1. Google Cloud: faturamento vinculado ao projeto; ative **Routes API** e **Map Tiles API**; crie uma chave de servidor
   restrita a essas duas APIs (sem restrição de aplicativo: a Vercel não tem IP fixo). Em **Cotas**, limite as chamadas
   por dia como trava extra.
2. Se `GOOGLE_MAPS_API_KEY` hoje guarda a chave do mapa da página de contato (Embed), mova esse valor para
   `GOOGLE_MAPS_EMBED_KEY` **antes**.
3. `GOOGLE_MAPS_ENABLED=true`, `GOOGLE_MAPS_API_KEY=<chave de servidor>`, `MAPAS_HMAC_SECRET=<openssl rand -hex 32>`,
   `CRON_SECRET=<openssl rand -hex 32>` (e as cotas, se quiser outras).
4. **Admin → Mapas**: marque "Usar o Google nesta loja", plano e percentual de pedidos.

**Desativar**: `GOOGLE_MAPS_ENABLED=false` (ou desmarque a loja no painel). Efeito imediato: tudo no OSRM e no mapa próprio.
As variáveis antigas `GOOGLE_MAPS_SERVER_KEY` e `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` não são mais usadas: apague-as
(a chave de navegador não deve mais existir).

## Fallback e o que o cliente vê

| Situação | Rota/ETA | Mapa |
|---|---|---|
| Tudo no ar, Google ligado | Google em gatilhos, OSRM no resto | Google (proxy) ou próprio |
| Google sem cota / erro / timeout | OSRM (registrado como fallback) | próprio, com aviso discreto |
| Sem Google | OSRM | próprio |
| OSRM fora | estimativa local | próprio |
| Sem VPS | estimativa local | simplificado (marcadores + rota sobre fundo neutro), aviso discreto |

O cliente nunca vê "erro de mapa": a posição e a ETA continuam atualizando pelo canal do pedido.

## Endpoints

| Método e rota | Quem | Faz |
|---|---|---|
| `POST /api/courier/location` · `POST /api/entregas/:id/posicao` | entregador da entrega | GPS (lat, lng, precisão, velocidade, horário); limite `gps` 20/min |
| `GET /api/orders/:id` | dono, admin, equipe da loja, entregador | resumo + eventos |
| `POST /api/orders/:id/status` | admin (2FA) | próximo passo do fluxo |
| `POST /api/deliveries/:pedido/assign-courier` | admin (2FA) | despacho (ponto do pino / Nominatim / coordenadas) + rota inicial |
| `GET /api/orders/:id/tracking` | idem pedido | rastreio (posição ~100 m, ETA, rota, loja) |
| `GET /api/orders/:id/tracking-stream` | idem pedido | SSE; limite `mapas` |
| `POST /api/maps/route` · `POST /api/maps/eta` | idem pedido | rota/ETA atuais; `manual: true` recalcula se passou o intervalo |
| `POST /api/maps/config` | idem pedido | configuração segura do mapa (1 por sessão) |
| `GET /api/maps/base` | público | mapa base próprio para o pino do checkout (nunca Google) |
| `POST /api/maps/geocode` | sessão | sugestão do ponto (Nominatim) |
| `GET /api/maps/tiles/:z/:x/:y?t=` | link assinado | proxy dos tiles do Google |
| `POST /api/admin/restaurants` · `POST /api/admin/couriers` | admin (2FA) | restaurantes / entregadores |
| `GET /api/cron/mapas` | Vercel Cron | consolidação diária |

Todas as mutações exigem a mesma origem (CSRF), corpo JSON pequeno, sessão; o banco confere tudo de novo (RLS e
funções `security definer`). Admin sem 2FA ou não-admin recebe 404.

## Testes

`npm test` (unitários + banco no PGlite) e `npm run test:http` (servidor local): Google com cota, fallback para OSRM
quando a cota acaba, cache, recálculo a cada 2 min, GPS sem chamada ao Google, cliente sem a chave, sistema sem Google e
sem VPS, limites por pedido/entregador/restaurante, RLS das tabelas novas, reversão das migrações.
