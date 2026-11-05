import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Status = Database['public']['Enums']['order_status'];
export const STATUS_LISTA: Status[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
export const PAGAMENTO: Record<string, string> = { cash: 'Dinheiro', pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', other: 'Outro' };

// Guarda do painel: só profiles.role = 'admin'. Chamada em TODA página e ação (o layout sozinho não basta, pois não roda
// de novo em cada navegação). Sem login vai ao /login; logado sem ser admin recebe 404, sem revelar que o painel existe.
// O RLS do banco é a trava final: mesmo se esta checagem falhasse, um cliente comum não lê nem altera nada daqui.
// Nível 1: logado e admin (aal1 basta). Usado só nas telas de login/2FA/ativação do 2FA.
export async function adminLogado() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (perfil?.role !== 'admin') notFound();
  return { supabase, user };
}

// Para onde mandar um admin que ainda não está em aal2: tem fator TOTP verificado -> código; não tem -> ativar 2FA.
export async function destinoMfa(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === 'aal2') return '/admin';
  return data?.nextLevel === 'aal2' ? '/admin/login/2fa' : '/admin/seguranca';
}

// Guarda de todo o painel: admin + 2FA concluído (AAL2). Sem 2FA vai ao código ou à ativação.
export async function exigirAdmin() {
  const { supabase, user } = await adminLogado();
  const destino = await destinoMfa(supabase);
  if (destino !== '/admin') redirect(destino);
  return { supabase, user };
}

// data de hoje no fuso de São Paulo (AAAA-MM-DD), o mesmo fuso das views de relatório
export const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const diaBr = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
export const mesBr = (d: string | null) => (d ? d.slice(0, 7).split('-').reverse().join('/') : '');
export const DATA = /^\d{4}-\d{2}-\d{2}$/;

// "12,50" / "1.234,50" / "12.5" -> centavos. Vazio -> null (valor a confirmar). Inválido -> undefined.
export function paraCentavos(v: FormDataEntryValue | null, max = 999999): number | null | undefined {
  const s = String(v ?? '').replace(/R\$|\s/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  const c = Math.round(n * 100);
  return Number.isFinite(n) && c >= 0 && c <= max ? c : undefined;
}
export const doisDec = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
