import { after, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { UUID, adminApi, json, lerJson, mesmaOrigem } from '@/lib/api';
import { despachar } from '@/lib/despacho';

// POST /api/deliveries/{pedido}/assign-courier — { courierId, coords? } (admin, 2FA). A entrega nasce no despacho, então
// o {id} é o do PEDIDO (Pronto, de entrega). Mesmas regras do botão "Saiu para entrega" (lib/despacho.ts).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!mesmaOrigem(req)) return json(403, { erro: 'origin' });
  const adm = await adminApi();
  if (!adm) return json(404, { erro: 'not_found' });
  const { id } = await params;
  const b = await lerJson(req, 512);
  const entregador = String(b?.courierId ?? '');
  if (!UUID.test(id) || !UUID.test(entregador)) return json(400, { erro: 'invalid' });
  const r = await despachar(adm.supabase, id, entregador, typeof b?.coords === 'string' ? b.coords.slice(0, 40) : '');
  if (!r.ok) return json(r.erro === 'fluxo' ? 409 : 422, { erro: r.erro });
  after(r.rotaInicial);
  for (const p of ['/admin', '/admin/loja', `/pedido/${id}`, '/entregador']) revalidatePath(p);
  return json(200, { entrega: r.entrega });
}
