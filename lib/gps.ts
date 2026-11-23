import { after, type NextRequest } from 'next/server';
import { UUID, json, lerCorpo, mesmaOrigem, num } from '@/lib/api';
import { aproximar, decodificarPolyline, deveRecalcular } from '@/lib/regras';
import { permitir, registrarNegado } from '@/lib/protecao';
import { usuarioAtual } from '@/lib/supabase/server';
import { clienteServico } from '@/lib/supabase/servico';
import { configMapas } from '@/lib/mapas/config';
import { ajustarPosicao, calcularRota, type ContextoPedido } from '@/lib/mapas/servico';

// GPS do entregador (POST /api/entregas/{id}/posicao e POST /api/courier/location).
// Camadas: mesma origem, corpo <= 1 KB, números validados, sessão, limite de envios ('gps', 20/min) e o banco
// (courier_report_position: entregador vinculado/ativo, horário, duplicada, salto impossível, precisão).
// O GPS é barato: grava e publica a posição. A rota só é recalculada por gatilho (lib/regras.ts: deveRecalcular),
// depois de responder ao app.
export async function receberPosicao(req: NextRequest, id: string | null) {
  if (!mesmaOrigem(req)) return json(403, { r: 'origin' });
  const { j: b, grande } = await lerCorpo(req, 1024);
  if (grande) return json(413, { r: 'payload' });
  if (!b) return json(400, { r: 'json' });
  id ??= typeof b.entregaId === 'string' ? b.entregaId : typeof b.deliveryId === 'string' ? b.deliveryId : '';
  if (!UUID.test(id)) return json(404, { r: 'not_found' });
  const lat = num(b.latitude, -90, 90), lng = num(b.longitude, -180, 180), prec = num(b.precisaoMetros ?? b.accuracy, 0, 100000);
  const vel = num(b.velocidadeKmh ?? b.speedKmh, 0, 1000);
  const quando = b.capturadoEm ?? b.timestamp;
  const em = typeof quando === 'string' && quando.length <= 40 ? new Date(quando) : null;
  if (lat === null || lng === null || prec === null || !em || Number.isNaN(em.getTime())) return json(400, { r: 'invalid' });

  const { supabase, user } = await usuarioAtual();
  if (!user) return json(401, { r: 'login' });
  if (!(await permitir('gps'))) return json(429, { r: 'rate_limited' });
  const { data, error } = await supabase.rpc('courier_report_position', {
    p_delivery_id: id, p_lat: lat, p_lng: lng, p_accuracy_m: prec, p_speed_kmh: vel as number, p_captured_at: em.toISOString(),
  });
  if (error) { console.error('[posicao]', error.message); return json(500, { r: 'erro' }); }
  if (data === 'not_assigned') {
    await registrarNegado(user.id);
    console.warn('[posicao] negado', { user: user.id.slice(0, 8), entrega: id.slice(0, 8) });
    return json(403, { r: 'not_assigned' });
  }
  if (data === 'ok') after(() => recalcularSePreciso(supabase, id, user.id).catch(e => console.error('[rota]', String(e))));
  // descartes (stale, duplicate, too_fast, jump...) não são erro do app: responde 200 com o motivo
  return json(200, { r: String(data) });
}

type Sb = Awaited<ReturnType<typeof usuarioAtual>>['supabase'];

async function recalcularSePreciso(supabase: Sb, id: string, entregador: string) {
  const { data: d } = await supabase.from('deliveries')
    .select('order_id, status, dest_lat, dest_lng, eta_updated_at, route_polyline, started_at, last_lat, last_lng, orders(id, status, customer_name, restaurant_id)')
    .eq('id', id).maybeSingle();
  if (!d || d.last_lat === null || d.last_lng === null) return;
  const cfg = configMapas();
  const agora = Date.now();
  const ultima = d.eta_updated_at ? new Date(d.eta_updated_at).getTime() : null;
  // virou "a caminho" agora (1ª posição depois de aceitar): started_at acabou de ser gravado
  const virouEmRota = !!d.started_at && agora - new Date(d.started_at).getTime() < 30_000;
  const dec = deveRecalcular({
    agora, ultimaRotaEm: ultima, intervaloMs: cfg.google.intervaloMs, posicao: { lat: d.last_lat, lng: d.last_lng },
    destino: { lat: d.dest_lat, lng: d.dest_lng }, rota: d.route_polyline ? decodificarPolyline(d.route_polyline) : [], virouEmRota,
  });
  if (!dec.recalcular) return;
  // origem: posição encaixada nas ruas (map matching) e arredondada (~100 m), como a mostrada ao cliente
  // posições brutas só o servidor lê (RLS: o entregador não lê o histórico)
  const { data: ps } = await (clienteServico() ?? supabase).from('delivery_positions').select('lat, lng, accuracy_m, captured_at').eq('delivery_id', id).order('captured_at', { ascending: false }).limit(8);
  const pontos = (ps ?? []).reverse().map(p => ({ lat: p.lat, lng: p.lng, prec: p.accuracy_m, t: new Date(p.captured_at).getTime() }));
  const origem = (await ajustarPosicao(pontos)) ?? { lat: d.last_lat, lng: d.last_lng };
  const pedido = await contextoPedido(d.orders as unknown as ContextoPedido);
  const r = await calcularRota({ lat: aproximar(origem.lat), lng: aproximar(origem.lng) }, { lat: d.dest_lat, lng: d.dest_lng },
    { pedido, entregaId: id, entregadorId: entregador, endpoint: `gps:${dec.motivo}`, podeGoogle: dec.podeGoogle });
  await supabase.rpc('courier_set_eta', { p_delivery_id: id, p_eta_minutes: r.minutos, p_distance_km: r.km, p_polyline: r.polyline as string, p_provider: r.provedor });
}

// pedido + configuração do restaurante (flags do Google), lida pelo servidor
export async function contextoPedido(p: ContextoPedido): Promise<ContextoPedido> {
  const s = clienteServico();
  if (!s || !p?.restaurant_id) return { ...p, restaurante: null };
  const { data } = await s.from('restaurants').select('google_maps_enabled, plan, google_maps_percent').eq('id', p.restaurant_id).maybeSingle();
  return { ...p, restaurante: data ?? null };
}
