'use server';
import { usuarioAtual } from '@/lib/supabase/server';

// Convite para avaliar. Toda regra (3 pedidos entregues, um convite por pedido, 2 recusas no máximo, uma avaliação por conta)
// está nas funções do banco (migration 011); aqui só validamos a entrada e repassamos.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function abrirConvite(): Promise<{ pedido: string; numero: number } | null> {
  const { supabase, user } = await usuarioAtual();
  if (!user) return null;
  const { data } = await supabase.rpc('review_invite');
  const c = data?.[0];
  return c ? { pedido: c.order_id, numero: Number(c.order_number) } : null;
}

export async function recusarConvite(pedido: string) {
  if (typeof pedido !== 'string' || !UUID.test(pedido)) return;
  const { supabase, user } = await usuarioAtual();
  if (user) await supabase.rpc('review_decline', { p_order_id: pedido });
}

export async function enviarAvaliacao(pedido: string, nota: number, comentario: string): Promise<{ ok: true } | { erro: string }> {
  if (typeof pedido !== 'string' || !UUID.test(pedido)) return { erro: 'Convite inválido.' };
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) return { erro: 'Escolhe de 1 a 5 estrelas aí.' };
  const texto = typeof comentario === 'string' ? comentario.slice(0, 1000) : '';
  const { supabase, user } = await usuarioAtual();
  if (!user) return { erro: 'Sua sessão expirou. Entre de novo para avaliar.' };
  const { error } = await supabase.rpc('review_submit', { p_order_id: pedido, p_rating: nota, p_comment: texto });
  if (error) return { erro: error.message.includes('already_reviewed') ? 'Você já avaliou a gente. Valeu!' : 'Não deu para salvar agora. Tenta de novo?' };
  return { ok: true };
}

export async function registrarGoogle() {
  const { supabase, user } = await usuarioAtual();
  if (user) await supabase.rpc('review_google_click');
}
