# Mapas self-hosted (VPS)

Mapa, rotas, ETA, map matching e endereços do rastreamento rodam aqui, sem serviço de terceiros:

| Serviço | O que faz | Exposto? |
|---|---|---|
| **OSRM** (`osrm`) | rota carro, ETA, map matching (`/match`) | só pelo Nginx, com `X-Mapas-Token` |
| **Nominatim** (`nominatim`) | endereço → coordenadas (dados OpenStreetMap) | só pelo Nginx, com `X-Mapas-Token` |
| **PMTiles** (`dados/regiao.pmtiles`) | mapa base vetorial, desenhado no navegador (Leaflet + protomaps-leaflet) | público em `/tiles/`, CORS só do site |
| **Nginx + Let's Encrypt** | HTTPS, limites por IP, token, cabeçalhos | portas 80/443 |

O site (Next.js na Vercel) continua funcionando **sem** este servidor: ETA pela distância, mapa simplificado e coordenadas
coladas pela loja no despacho. Ver `docs/arquitetura-rastreamento.md`.

## Requisitos do VPS

- Linux (Ubuntu 24.04 ou Debian 12), Docker Engine + plugin Compose.
- Recorte da Grande SP: **4 vCPU, 8 GB RAM, 40 GB de disco** (a importação do Nominatim é o pico; depois usa ~2 GB).
- Um domínio (ex.: `mapas.mdogao.com.br`) com registro A apontando para o IP do VPS.
- Firewall: só 22 (SSH), 80 e 443 abertos.

## Execução local (Docker Desktop)

```sh
cd infra
cp .env.example .env              # preencha: MAPAS_DOMINIO=localhost, MAPAS_TOKEN, SITE_ORIGEM=http://localhost:3000, NOMINATIM_DB_PASSWORD
sh scripts/preparar-dados.sh      # baixa o OSM do Brasil (~2 GB), recorta, gera OSRM e PMTiles (30–60 min)
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d osrm nominatim nginx
docker compose logs -f nominatim  # 1ª vez: importação (pode levar de 30 min a algumas horas)
```

No `.env.local` do site: `MAPAS_URL=http://localhost:8080` e o mesmo `MAPAS_TOKEN`. Teste:

```sh
curl -H "X-Mapas-Token: $MAPAS_TOKEN" "http://localhost:8080/osrm/route/v1/driving/-46.934,-23.537;-46.92,-23.55?overview=false"
curl -H "X-Mapas-Token: $MAPAS_TOKEN" "http://localhost:8080/nominatim/search?q=Itapevi&format=jsonv2&limit=1"
curl -I -H "Range: bytes=0-99" http://localhost:8080/tiles/regiao.pmtiles   # 206
```

## Deploy no VPS

```sh
# 1. no servidor
git clone https://github.com/klinsmg/0002-FD-S.git && cd 0002-FD-S/infra
cp .env.example .env && nano .env                       # MAPAS_DOMINIO, MAPAS_TOKEN (openssl rand -hex 32), SITE_ORIGEM, NOMINATIM_DB_PASSWORD
sh scripts/preparar-dados.sh

# 2. certificado (primeira vez, ANTES de subir o Nginx: o certbot usa a porta 80 sozinho)
docker compose run --rm -p 80:80 --entrypoint certbot certbot certonly --standalone -d "$(grep ^MAPAS_DOMINIO .env | cut -d= -f2)" --agree-tos -m SEU_EMAIL --no-eff-email

# 3. tudo no ar (o certbot renova sozinho a cada 12 h, se faltar < 30 dias)
docker compose up -d
docker compose ps
```

Depois, na **Vercel** (Settings → Environment Variables) e **Redeploy**:

| Variável | Valor |
|---|---|
| `MAPAS_URL` | `https://mapas.mdogao.com.br` |
| `MAPAS_TOKEN` | o mesmo do `infra/.env` |

O painel **Admin → Mapas** mostra se OSRM, Nominatim e tiles estão no ar.

## Manutenção

- **Atualizar o mapa (mensal):** `sh scripts/preparar-dados.sh`, depois `docker compose restart osrm` e, para o Nominatim,
  `docker compose down nominatim && docker volume rm mdogao-mapas_nominatim-db && docker compose up -d nominatim`.
- **Trocar o token:** gere outro, troque no `infra/.env` e na Vercel, `docker compose up -d nginx` e Redeploy.
- **Área de entrega maior:** ajuste `BBOX` no script (oeste,sul,leste,norte) e refaça os dados.
- **Logs:** `docker compose logs --tail 100 nginx`.

## Segurança (testado com o Nginx local)

- `/osrm/` e `/nominatim/` recusam (403) sem o token, com token errado ou vazio, e qualquer método além de GET.
- `/tiles/` serve **só** `*.pmtiles` (o `.osm.pbf` e os arquivos do OSRM dão 404; path traversal também), GET/HEAD/OPTIONS.
- CORS dos tiles só para `SITE_ORIGEM`; corpo máximo 4 KB (413); limite por IP (`limit_req`); versão do Nginx oculta.
- Containers com `no-new-privileges`, OSRM somente leitura, dados montados como `:ro`.
