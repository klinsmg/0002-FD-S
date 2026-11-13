'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { LIMITE_ENDERECOS, limpa } from '@/lib/conta';
import { usuarioAtual } from '@/lib/supabase/server';

// Endereços do cliente. Cada ação exige sessão, usa o cliente do USUÁRIO (RLS) e ainda filtra por user_id.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// a lista de endereços vive em /conta/configuracoes (seção #enderecos)
const LISTA = '/conta/configuracoes';
const VOLTA = `${LISTA}#enderecos`;
const erroEm = (codigo: string, extra = '') => `${LISTA}?secao=enderecos&erro=${codigo}${extra}#enderecos`;
function atualizar() { revalidatePath(LISTA); revalidatePath('/conta'); }

async function logado() {
  const { supabase, user } = await usuarioAtual();
  if (!user) redirect('/login');
  return { supabase, user };
}
const idDe = (f: FormData) => { const v = String(f.get('id') ?? ''); return ID.test(v) ? v : null; };

// valida no servidor; devolve null se algo estiver fora do padrão
function lerEndereco(f: FormData) {
  const t = (k: string, max: number) => limpa(f.get(k), max);
  const e = {
    label: t('label', 40) || 'Casa',
    zip_code: String(f.get('zip_code') ?? '').replace(/\D/g, ''),
    street: t('street', 120), number: t('number', 10), complement: t('complement', 60) || null,
    district: t('district', 100), city: t('city', 100), state: t('state', 2).toUpperCase(),
    reference: t('reference', 150) || null, is_default: f.get('is_default') === 'on',
  };
  const ok = /^\d{8}$/.test(e.zip_code) && /^[A-Z]{2}$/.test(e.state) && e.street && e.number && e.district && e.city;
  return ok ? e : null;
}

export async function createAddress(f: FormData) {
  const { supabase, user } = await logado();
  const e = lerEndereco(f);
  if (!e) redirect(erroEm('invalido'));
  // limite checado aqui (mensagem clara) e no banco (gatilho addresses_limit), que é a trava final
  const { count } = await supabase.from('addresses').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  if ((count ?? 0) >= LIMITE_ENDERECOS) redirect(erroEm('limite'));
  const { error } = await supabase.from('addresses').insert({ ...e, user_id: user.id });
  if (error) redirect(erroEm(error.code === '23514' ? 'limite' : 'falha'));
  atualizar();
  redirect(VOLTA);
}

export async function updateAddress(f: FormData) {
  const { supabase, user } = await logado();
  const id = idDe(f);
  if (!id) redirect(VOLTA);
  const e = lerEndereco(f);
  if (!e) redirect(erroEm('invalido', `&editar=${id}`));
  const { error } = await supabase.from('addresses').update(e).eq('id', id).eq('user_id', user.id);
  if (error) redirect(erroEm('falha'));
  atualizar();
  redirect(VOLTA);
}

export async function deleteAddress(f: FormData) {
  const { supabase, user } = await logado();
  const id = idDe(f);
  if (id) await supabase.from('addresses').delete().eq('id', id).eq('user_id', user.id);
  atualizar();
  redirect(VOLTA);
}

export async function setDefaultAddress(f: FormData) {
  const { supabase, user } = await logado();
  const id = idDe(f);
  if (id) await supabase.from('addresses').update({ is_default: true }).eq('id', id).eq('user_id', user.id);
  atualizar();
  redirect(VOLTA);
}
