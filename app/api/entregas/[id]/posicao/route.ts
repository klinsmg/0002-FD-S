import { NextResponse, after, type NextRequest } from 'next/server';
import { rotaEta } from '@/lib/geo';
import { aproximar } from '@/lib/regras';
import { cookies } from 'next/headers';
import { usuarioAtual } from '@/lib/supabase/server';

// POST /api/entregas/{id}/posicao — o app do entregador envia o GPS aqui (com os cookies da sessão).
// Camadas: Origin igual ao site, corpo de no máximo 1 KB, números validados, sessão; o banco (courier_report_position)
// confere entregador vinculado/ativo, horário, duplicada, salto impossível e o limite de 1 envio a cada 3 s.
// Recusa por falta de vínculo vira registro de segurança (log_denied).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const resp = (status: number, r: string) => NextResponse.json({ r }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origem = req.headers.get('origin');
  if (!origem || origem !== req.nextUrl.origin) return resp(403, 'origin');
  if (Number(req.headers.get('content-length') ?? 0) > 1024) return resp(413, 'payload');
  const { id } = await params;
  if (!UUID.test(id)) return resp(404, 'not_found');

  const texto = await req.text();
  if (texto.length > 1024) return resp(413, 'payload');
  let b: Record<string, unknown>;
  try { b = JSON.parse(texto); } catch { return resp(400, 'json'); }
  const lat = num(b.latitude, -90, 90), lng = num(b.longitude, -180, 180), prec = num(b.precisaoMetros, 0, 100000);
  const vel = num(b.velocidadeKmh, 0, 1000);
  const em = typeof b.capturadoEm === 'string' && b.capturadoEm.length <= 40 ? new Date(b.capturadoEm) : null;
  if (lat === null || lng === null || prec === null || !em || Number.isNaN(em.getTime())) return resp(400, 'invalid');

  const { supabase, user } = await usuarioAtual();
  if (!user) return resp(401, 'login');
  const { data, error } = await supabase.rpc('courier_report_position', {
    // vel null = sem velocidade (o tipo gerado não marca o parâmetro como anulável)
    p_delivery_id: id, p_lat: lat, p_lng: lng, p_accuracy_m: prec, p_speed_kmh: vel as number, p_captured_at: em.toISOString(),
  });
  if (error) { console.error('[posicao]', error.message); return resp(500, 'erro'); }
  if (data === 'not_assigned') {
    const ip = (req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim();
    await supabase.rpc('log_denied', { p_ip: ip, p_device: (await cookies()).get('disp')?.value ?? '' });
    console.warn('[posicao] negado', { user: user.id.slice(0, 8), entrega: id.slice(0, 8) });
    return resp(403, 'not_assigned');
  }
  // ETA no servidor, depois de responder ao app (não atrasa o envio): no máximo a cada 45 s por entrega.
  // Origem arredondada (~100 m), igual à posição mostrada ao cliente.
  if (data === 'ok') {
    after(async () => {
      const { data: d } = await supabase.from('deliveries').select('dest_lat, dest_lng, eta_updated_at').eq('id', id).maybeSingle();
      if (!d || (d.eta_updated_at && Date.now() - new Date(d.eta_updated_at).getTime() < 45_000)) return;
      const e = await rotaEta({ lat: aproximar(lat), lng: aproximar(lng) }, { lat: d.dest_lat, lng: d.dest_lng });
      await supabase.rpc('courier_set_eta', { p_delivery_id: id, p_eta_minutes: e.minutos, p_distance_km: e.km, p_polyline: e.polyline as string });
    });
  }
  // descartes (stale, duplicate, too_fast, jump...) não são erro do app: responde 200 com o motivo
  return resp(200, String(data));
}
