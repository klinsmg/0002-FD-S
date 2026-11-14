import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Status = Database['public']['Enums']['order_status'];
export const STATUS_LISTA: Status[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

// Fluxo da loja (o banco confere o mesmo na migration 012, função order_status_ok):
//   Novo -> Em preparo -> Pronto -> entrega: Saiu para entrega | retirada: Entregue ("Retirado").
// "Entregue" de pedido de ENTREGA não sai do painel: só pelo fluxo do entregador (bloco 11).
export function proximos(de: Status, tipo: string): Status[] {
  switch (de) {
    case 'pending': case 'confirmed': return ['preparing', 'cancelled'];
    case 'preparing': return ['ready', 'cancelled'];
    case 'ready': return [tipo === 'delivery' ? 'out_for_delivery' : 'delivered', 'cancelled'];
    case 'out_for_delivery': return ['cancelled'];
    default: return [];
  }
}
export const podeIr = (de: Status, para: Status, tipo: string) => proximos(de, tipo).includes(para);

// Endereço de entrega (jsonb do pedido) em uma linha
export const enderecoTexto = (e: unknown) => {
  if (!e || typeof e !== 'object') return '';
  const a = e as Record<string, string | undefined>;
  return [`${a.street ?? ''}, ${a.number ?? ''}${a.complement ? ` – ${a.complement}` : ''}`, a.district, a.city && `${a.city}/${a.state ?? ''}`, a.reference && `Ref.: ${a.reference}`].filter(Boolean).join(' · ');
};
export const PAGAMENTO: Record<string, string> = { cash: 'Dinheiro', pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', other: 'Outro' };

// Guarda do painel: só profiles.role = 'admin'. Chamada em TODA página e ação (o layout sozinho não basta, pois não roda
// de novo em cada navegação). Sem login vai ao /login; logado sem ser admin recebe 404, sem revelar que o painel existe.
// O RLS do banco é a trava final: mesmo se esta checagem falhasse, um cliente comum não lê nem altera nada daqui.
// Nível 1: logado e admin (aal1 basta). Usado só nas telas de login/2FA/ativação do 2FA.
// Desempenho: getClaims confere a assinatura do JWT localmente (chave ES256 do projeto, JWKS em cache), sem ida ao servidor
// de auth, e o JWT já traz aal e amr. cache() faz layout e página dividirem a mesma checagem na requisição.
// Limite conhecido: sessão encerrada em outro lugar vale até o JWT vencer (até 1 h), igual ao que o próprio RLS aceita.
export const adminLogado = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c) redirect('/admin/login');
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', c.sub).maybeSingle();
  if (perfil?.role !== 'admin') notFound();
  // O painel é só e-mail+senha(+TOTP): sessão aberta por Google/link (sem 'password' no amr) não vale, mesmo que o e-mail seja de um admin.
  if (!temSenha(c.amr)) redirect('/admin/login');
  return { supabase, user: { id: c.sub, email: c.email }, aal: c.aal };
});

// amr pode vir como texto ou como { method }
export const temSenha = (m?: (string | { method: string })[]) => !!m?.some(x => (typeof x === 'string' ? x : x.method) === 'password');

// Para onde mandar um admin que ainda não está em aal2: tem fator TOTP verificado -> código; não tem -> ativar 2FA.
export async function destinoMfa(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel === 'aal2') return '/admin';
  return data?.nextLevel === 'aal2' ? '/admin/login/2fa' : '/admin/seguranca';
}

// Guarda de todo o painel: admin + 2FA concluído (AAL2). Sem 2FA vai ao código ou à ativação.
export const exigirAdmin = cache(async () => {
  const { supabase, user, aal } = await adminLogado();
  if (aal !== 'aal2') redirect(await destinoMfa(supabase));
  return { supabase, user };
});

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
