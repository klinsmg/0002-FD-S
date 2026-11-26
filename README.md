# Dogão Itapevi — site

Next.js 16 (App Router) + TypeScript + Tailwind v4 + CSS nativo · Alpine.js (lazy após o 1º render) · Leaflet (mapas, sob demanda) · deploy na Vercel.
Base: template `foodvitrinetemplete`.

## Comandos
`npm install` · `npm run dev` · `npm run build` · `npm start` (pare o servidor antes de buildar)

## Onde editar
- `lib/info.ts`: telefone, WhatsApp, endereço, Instagram (horários: Admin › Configurações › Horários; o arquivo só serve de reserva).
- `lib/menu.ts`: categorias do cardápio (páginas em imagem em `public/menu`).
- `app/tema.css`: cores e fontes (vindas da logo).
- `node scripts/assets.mjs`: regera WebP/logo/vídeos a partir da pasta do cliente.

## Deploy
Importar o repositório na Vercel (framework Next.js detectado, sem configuração).
Domínio: `mdogao.com.br`, definido em `site` (`lib/info.ts`). Ele alimenta `metadataBase`, sitemap, robots, llms.txt e ai.txt.

## Como o sistema funciona
Next.js (Vercel) + Supabase (Postgres com RLS, Auth com Google e e-mail/senha+2FA, Realtime). Perfis: cliente,
loja/admin e entregador. Pedido por status (Novo → Em preparo → Pronto → Saiu para entrega → Entregue/Cancelado): a loja
direciona a entrega a um entregador e ele dá baixa no app `/entregador` (sem GPS); o cliente acompanha ao vivo. Lista completa de funções, páginas e endpoints: **`INVENTARIO.md`**.
Relatório de testes, desempenho e segurança: **`RELATORIO.md`**.

## Testes
`npm test` (unitários + banco no PGlite, sem tocar o banco real) · `npm run test:http` (com `next start -p 3100` ligado).

## Segurança
**Superfície de ataque:** login (Google e admin com 2FA), Server Actions, `/api/*`, Realtime (canais privados) e a API
REST do Supabase (protegida por RLS em todas as tabelas). Detalhes, achados e pendências em `RELATORIO.md` (Fases 4–5).

**Já aplicado no código**
- `next.config.ts`: CSP (`default-src 'self'`, sem scripts de publicidade (só Vercel Web Analytics e Speed Insights, mesma origem e sem cookies), `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests`), HSTS com preload, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, sem `X-Powered-By`, sem source maps no navegador.
- Otimizador de imagens travado: sem `remotePatterns` (SSRF), `localPatterns` só para `/img/**` e o logo, poucos tamanhos permitidos, SVG desligado.
- Cache de CDN nas mídias (`/img`, `/video`) e páginas estáticas: absorve picos de acesso.
- `lib/carrinho.ts`: tudo que o cliente digita é sanitizado (caracteres de controle e de inversão de texto removidos), limitado em tamanho e tratado só como texto; o armazenamento local é validado ao carregar; envio com intervalo mínimo; resposta do ViaCEP tratada como não confiável.
- Iframe do mapa em `sandbox`; links externos com `noopener`; `/.well-known/security.txt`.

**Fora do código (fazer no painel, quando publicar)**
- Vercel: ativar *Vercel Firewall* (regras de limite de requisições por IP, ex.: `/_next/image`) e *Bot Protection* / *Attack Challenge Mode* em caso de ataque. É a defesa contra DDoS/HTTP flood/Slowloris, que acontece na borda, não no código.
- Autenticação em dois fatores na Vercel, no GitHub e no registro do domínio; bloqueio de transferência do domínio; DNSSEC ativado; registro CAA no DNS. Isso protege contra defacement e sequestro de domínio.
- Se algum dia houver e-mail no domínio `mdogao.com.br`: SPF, DKIM e DMARC (anti-phishing).
- Manter `npm audit` e o `next` atualizados (`npm outdated`).

**Limitações conhecidas**
- A CSP precisa de `'unsafe-eval'` por causa do Alpine e de `'unsafe-inline'` pelos scripts de hidratação do Next. Para uma CSP estrita: migrar para `@alpinejs/csp` com nonce (exige reescrever as expressões do carrinho e renderização dinâmica).
- O conteúdo do site é público e pode ser copiado por quem quiser (o bloqueio de clique direito só dificulta o uso casual).
