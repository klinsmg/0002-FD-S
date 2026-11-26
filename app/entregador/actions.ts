'use server';
import { revalidatePath } from 'next/cache';
import { entregadorAtual } from '@/lib/entregador';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Confirmacao = { ok: true } | { erro: string };

// Baixa da entrega: o banco (courier_confirm_delivery) confere que a entrega é deste entregador, ativo, e está em andamento.
export async function confirmarEntrega(id: string): Promise<Confirmacao> {
  if (typeof id !== 'string' || !UUID.test(id)) return { erro: 'Entrega inválida.' };
  const { supabase, user, liberado } = await entregadorAtual();
  if (!user || !liberado) return { erro: 'Sua conta não está liberada como entregador.' };
  const { data, error } = await supabase.rpc('courier_confirm_delivery', { p_delivery_id: id });
  if (error) return { erro: 'Não deu para dar baixa agora. Tenta de novo.' };
  if (data !== 'delivered') return { erro: 'Esta entrega não está mais com você.' };
  revalidatePath('/entregador');
  return { ok: true };
}

const MOTIVOS = ['recusada', 'cliente_ausente', 'endereco_nao_encontrado', 'outro'] as const;
export type Motivo = (typeof MOTIVOS)[number];

// Recusar ou devolver para a loja: o pedido volta para "Pronto" e a loja decide (outro entregador ou cancelar).
export async function devolverEntrega(id: string, motivo: Motivo): Promise<Confirmacao> {
  if (typeof id !== 'string' || !UUID.test(id) || !MOTIVOS.includes(motivo)) return { erro: 'Pedido inválido.' };
  const { supabase, user, liberado } = await entregadorAtual();
  if (!user || !liberado) return { erro: 'Sua conta não está liberada como entregador.' };
  const { data, error } = await supabase.rpc('courier_return_delivery', { p_delivery_id: id, p_motivo: motivo });
  if (error) return { erro: 'Não deu para avisar a loja agora. Tenta de novo.' };
  if (data !== 'ok') return { erro: 'Esta entrega não está mais com você.' };
  revalidatePath('/entregador');
  return { ok: true };
}
