'use server';
import { revalidatePath } from 'next/cache';
import { entregadorAtual } from '@/lib/entregador';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Confirmacao = { ok: true } | { erro: string; distancia?: number; raio?: number };

// "Entregue": quem decide é o banco (courier_confirm_delivery), com a última posição válida que ELE gravou.
export async function confirmarEntrega(id: string): Promise<Confirmacao> {
  if (typeof id !== 'string' || !UUID.test(id)) return { erro: 'Entrega inválida.' };
  const { supabase, user, liberado } = await entregadorAtual();
  if (!user || !liberado) return { erro: 'Sua conta não está liberada como entregador.' };
  const { data, error } = await supabase.rpc('courier_confirm_delivery', { p_delivery_id: id });
  const r = data?.[0];
  if (error || !r) return { erro: 'Não deu para confirmar agora. Tenta de novo.' };
  const dist = r.distance_m == null ? undefined : Math.round(r.distance_m);
  switch (r.result) {
    case 'delivered':
      revalidatePath('/entregador');
      return { ok: true };
    case 'too_far':
      return { erro: `Você está a ${dist} m do endereço. Chegue a até ${r.radius_m} m para confirmar.`, distancia: dist, raio: r.radius_m ?? undefined };
    case 'low_accuracy':
      return { erro: `O sinal do GPS está fraco (precisão de ${Math.round(r.accuracy_m ?? 0)} m). Fique parado em céu aberto por alguns segundos e tente de novo.` };
    case 'no_recent_position':
      return { erro: 'Ainda não recebemos sua localização atual. Deixe a localização ligada e aguarde alguns segundos.' };
    default:
      return { erro: 'Esta entrega não está mais com você.' };
  }
}
