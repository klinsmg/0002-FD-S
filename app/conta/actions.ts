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

export async function sair() {
  await (await createClient()).auth.signOut();
  redirect('/');
}

export async function salvarPerfil(f: FormData) {
  const { supabase, user } = await logado();
  const nome = limpa(f.get('full_name'), 120);
  const fone = limpa(f.get('phone'), 20);
  if (!nome || (fone && !/^[0-9+()\s.-]{8,20}$/.test(fone))) redirect('/conta/configuracoes?secao=perfil&erro=perfil#perfil');
  const { error } = await supabase.from('profiles').update({ full_name: nome, phone: fone || null }).eq('id', user.id);
  if (error) redirect('/conta/configuracoes?secao=perfil&erro=falha#perfil');
  revalidatePath('/conta');
  revalidatePath('/conta/configuracoes');
  redirect('/conta/configuracoes#perfil');
}
