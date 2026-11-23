import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { clienteServico } from '@/lib/supabase/servico';

// Job diário (Vercel Cron, vercel.json): consolida o consumo do Google por SKU, gera os avisos de 70/85/95/100% e faz a
// faxina (chamadas > 90 dias, cache de rota vencido). A Vercel envia Authorization: Bearer <CRON_SECRET>.
const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET ?? '';
  if (segredo.length < 16 || !igual(req.headers.get('authorization') ?? '', `Bearer ${segredo}`)) return new NextResponse(null, { status: 401 });
  const s = clienteServico();
  if (!s) return NextResponse.json({ erro: 'sem_chave' }, { status: 503 });
  const { data, error } = await s.rpc('google_consolidate');
  if (error) { console.error('[cron mapas]', error.message); return NextResponse.json({ erro: 'falha' }, { status: 500 }); }
  for (const u of data ?? []) if (Number(u.pct) >= 70) console.warn('[google] consumo', u.sku, `${u.pct}%`, `${u.used_events}/${u.free_cap}`);
  return NextResponse.json({ ok: true, consumo: data }, { headers: { 'Cache-Control': 'no-store' } });
}
