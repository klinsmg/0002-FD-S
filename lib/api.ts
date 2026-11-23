import { NextResponse, type NextRequest } from 'next/server';
import { createClient, usuarioAtual } from '@/lib/supabase/server';
import { temSenha } from '@/lib/admin';

// Utilitários das rotas /api: resposta sem cache, mesma origem (CSRF), corpo JSON pequeno e acesso ao pedido via RLS.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const json = (status: number, corpo: unknown) => NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
export const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

// Mutação só do próprio site: Origin presente e igual (o navegador sempre envia em POST de outro site)
export const mesmaOrigem = (req: NextRequest) => { const o = req.headers.get('origin'); return !!o && o === req.nextUrl.origin; };

// Corpo JSON pequeno: grande = passou do limite (413); j = null quando não é um objeto JSON (400)
export async function lerCorpo(req: NextRequest, max = 2048): Promise<{ j: Record<string, unknown> | null; grande: boolean }> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return { j: null, grande: true };
  const t = await req.text();
  if (t.length > max) return { j: null, grande: true };
  try { const j = JSON.parse(t); return { j: j && typeof j === 'object' && !Array.isArray(j) ? j : null, grande: false }; } catch { return { j: null, grande: false }; }
}
export const lerJson = async (req: NextRequest, max = 2048) => (await lerCorpo(req, max)).j;

// Pedido visível para quem chama (dono, admin, equipe do restaurante ou entregador da entrega: o RLS decide)
export async function pedidoVisivel(id: string) {
  const { supabase, user } = await usuarioAtual();
  if (!user || !UUID.test(id)) return { supabase, user, pedido: null };
  const { data } = await supabase.from('orders').select('id, status, order_type, customer_name, restaurant_id, user_id').eq('id', id).maybeSingle();
  return { supabase, user, pedido: data };
}

// Admin para rotas /api (sem redirecionar): role admin + sessão por senha + 2FA (aal2), como o painel.
// O banco confere de novo (is_admin exige aal2). Não-admin recebe 404, sem revelar que o endpoint existe.
export async function adminApi() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c || c.aal !== 'aal2' || !temSenha(c.amr as Parameters<typeof temSenha>[0])) return null;
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', c.sub).maybeSingle();
  return perfil?.role === 'admin' ? { supabase, id: c.sub } : null;
}

// validação compartilhada com o formulário do painel (/admin/mapas)
export function dadosRestaurante(b: Record<string, unknown>) {
  const nome = typeof b.name === 'string' ? b.name.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, 80) : '';
  const lat = b.lat == null || b.lat === '' ? null : num(Number(b.lat), -90, 90);
  const lng = b.lng == null || b.lng === '' ? null : num(Number(b.lng), -180, 180);
  const pct = b.google_maps_percent == null || b.google_maps_percent === '' ? null : num(Number(b.google_maps_percent), 0, 100);
  if (!nome || (b.lat != null && b.lat !== '' && lat === null) || (b.lng != null && b.lng !== '' && lng === null) || (lat === null) !== (lng === null)) return null;
  return {
    name: nome, lat, lng,
    ...(typeof b.active === 'boolean' && { active: b.active }),
    ...(typeof b.google_maps_enabled === 'boolean' && { google_maps_enabled: b.google_maps_enabled }),
    ...((b.plan === 'basico' || b.plan === 'premium') && { plan: b.plan }),
    ...(pct !== null && { google_maps_percent: Math.round(pct) }),
  };
}
