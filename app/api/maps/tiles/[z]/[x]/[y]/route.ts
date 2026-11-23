import type { NextRequest } from 'next/server';
import { configMapas } from '@/lib/mapas/config';
import { verificarTiles } from '@/lib/mapas/provedores';
import { depsPadrao } from '@/lib/mapas/servico';

// GET /api/maps/tiles/{z}/{x}/{y}?t=<link assinado> — proxy dos tiles do Google (Map Tiles API, 2D roadmap).
// A chave nunca sai do servidor. Sem link válido (HMAC + validade), Google desligado ou cota de tiles esgotada: 404,
// e o mapa do cliente continua com marcadores e rota (o Leaflet só deixa o quadradinho vazio).
let sessao: { token: string; expira: number } | null = null;
async function sessaoGoogle(chave: string) {
  if (sessao && sessao.expira - Date.now() > 3_600_000) return sessao.token;
  const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(chave)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mapType: 'roadmap', language: 'pt-BR', region: 'BR' }),
    signal: AbortSignal.timeout(5000), cache: 'no-store',
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || typeof j?.session !== 'string') return null;
  sessao = { token: j.session, expira: Number(j.expiry) * 1000 || Date.now() + 86_400_000 };
  return sessao.token;
}
const nada = (status = 404) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await params;
  const Z = Number(z), X = Number(x), Y = Number(y.replace(/\.png$/, ''));
  if (![Z, X, Y].every(Number.isInteger) || Z < 0 || Z > 20 || X < 0 || Y < 0 || X >= 2 ** Z || Y >= 2 ** Z) return nada(400);
  const cfg = configMapas();
  if (!cfg.google.mapaLigado || !verificarTiles(req.nextUrl.searchParams.get('t') ?? '', cfg.hmac, Date.now())) return nada(403);
  const deps = depsPadrao();
  if ((await deps.reservar('map_tiles', cfg.google.capTiles, cfg.google.softPct)) !== 'ok') return nada();
  const token = await sessaoGoogle(cfg.google.chave);
  if (!token) return nada(502);
  const r = await fetch(`https://tile.googleapis.com/v1/2dtiles/${Z}/${X}/${Y}?session=${encodeURIComponent(token)}&key=${encodeURIComponent(cfg.google.chave)}`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) return nada(502);
  return new Response(r.body, { headers: { 'Content-Type': r.headers.get('content-type')!, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
}
