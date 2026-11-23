import { pedidoVisivel } from '@/lib/api';
import { permitir } from '@/lib/protecao';

// GET /api/orders/{id}/tracking-stream — SSE (text/event-stream) com o rastreio do pedido. Alternativa ao canal
// WebSocket (Supabase Realtime) que a página usa: cada mudança vira um evento 'rastreio'. A conexão dura até ~55 s
// (limite da função na Vercel) e o EventSource reconecta sozinho (retry: 3 s).
export const maxDuration = 60;
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, pedido } = await pedidoVisivel(id);
  if (!user) return new Response('login', { status: 401 });
  if (!pedido) return new Response('not_found', { status: 404 });
  // cada conexão segura uma função por ~55 s: entra no limite 'mapas' (sem isso, uma conta abriria dezenas de conexões)
  if (!(await permitir('mapas'))) return new Response('rate_limited', { status: 429, headers: { 'Retry-After': '60' } });
  const enc = new TextEncoder();
  const corpo = new ReadableStream({
    async start(c) {
      const fim = Date.now() + 55_000;
      let ultimo = '';
      c.enqueue(enc.encode('retry: 3000\n\n'));
      while (Date.now() < fim && !req.signal.aborted) {
        const { data } = await supabase.rpc('order_tracking', { p_order_id: id });
        const t = JSON.stringify(data?.[0] ?? null);
        if (t !== ultimo) { ultimo = t; c.enqueue(enc.encode(`event: rastreio\ndata: ${t}\n\n`)); }
        else c.enqueue(enc.encode(': ping\n\n'));
        await new Promise(r => setTimeout(r, 5000));
      }
      c.close();
    },
  });
  return new Response(corpo, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
