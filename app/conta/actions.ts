'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { limpa } from '@/lib/conta';

// Todas as ações: exigem sessão válida e usam o cliente do USUÁRIO (chave publishable + RLS), nunca a service role.
// Além do RLS, cada escrita filtra por user_id.
async function logado() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idDe = (f: FormData) => { const v = String(f.get('id') ?? ''); return ID.test(v) ? v : null; };

export async function sair() {
  await (await createClient()).auth.signOut();
  redirect('/');
}

export async function salvarPerfil(f: FormData) {
  const { supabase, user } = await logado();
  const nome = limpa(f.get('full_name'), 120);
  const fone = limpa(f.get('phone'), 20);
  if (!nome || (fone && !/^[0-9+()\s.-]{8,20}$/.test(fone))) redirect('/conta?erro=perfil');
  const { error } = await supabase.from('profiles').update({ full_name: nome, phone: fone || null }).eq('id', user.id);
  if (error) redirect('/conta?erro=falha');
  revalidatePath('/conta');
  redirect('/conta');
}

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

export async function salvarEndereco(f: FormData) {
  const { supabase, user } = await logado();
  const id = idDe(f);
  const e = lerEndereco(f);
  if (!e) redirect(id ? `/conta/enderecos?editar=${id}&erro=invalido` : '/conta/enderecos?erro=invalido');
  const { error } = id
    ? await supabase.from('addresses').update(e).eq('id', id).eq('user_id', user.id)
    : await supabase.from('addresses').insert({ ...e, user_id: user.id });
  if (error) redirect(`/conta/enderecos?erro=${error.code === '23514' ? 'limite' : 'falha'}`);
  revalidatePath('/conta/enderecos');
  redirect('/conta/enderecos');
}

export async function excluirEndereco(f: FormData) {
  const { supabase, user } = await logado();
  const id = idDe(f);
  if (id) await supabase.from('addresses').delete().eq('id', id).eq('user_id', user.id);
  revalidatePath('/conta/enderecos');
  redirect('/conta/enderecos');
}

export async function definirPadrao(f: FormData) {
  const { supabase, user } = await logado();
  const id = idDe(f);
  if (id) await supabase.from('addresses').update({ is_default: true }).eq('id', id).eq('user_id', user.id);
  revalidatePath('/conta/enderecos');
  redirect('/conta/enderecos');
}
