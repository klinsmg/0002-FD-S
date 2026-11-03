import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Cabeçalhos de segurança. ponytail: 'unsafe-eval' é exigido pelo build padrão do Alpine.js (expressões x-*) e
// 'unsafe-inline' pelos scripts de hidratação do Next; trocar por @alpinejs/csp + nonce se quiser uma CSP estrita.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "font-src 'self' data:",
  "connect-src 'self' https://viacep.com.br",
  "frame-src https://www.google.com",
  "worker-src 'none'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const seguranca = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), accelerometer=(), gyroscope=(), magnetometer=(), display-capture=(), browsing-topics=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

// Mídia estática com cache de CDN: reduz a carga na origem em picos de acesso (HTTP flood).
const cacheMidia = [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }];

// Vercel: build padrão (sem export estático) para usar a otimização de imagens do next/image.
const c: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [75, 85, 92],
    // Otimizador só para as imagens do próprio site: nada de URL externa (SSRF) nem outros arquivos de /public.
    remotePatterns: [],
    localPatterns: [{ pathname: '/img/**', search: '' }, { pathname: '/logo-dogao.webp', search: '' }],
    // Poucas variações de tamanho: limita o custo de quem tentar encher o cache de imagens.
    deviceSizes: [640, 828, 1080, 1366, 1920],
    imageSizes: [128, 256, 384],
    minimumCacheTTL: 604800,
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'none'; script-src 'none'; sandbox;",
  },
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  async headers() {
    return [
      { source: '/:path*', headers: seguranca },
      { source: '/img/:path*', headers: cacheMidia },
      { source: '/video/:path*', headers: cacheMidia },
    ];
  },
};
export default c;
