'use server';
import { redirect } from 'next/navigation';
import { destinoMfa } from '@/lib/admin';
import { createClient } from '@/lib/supabase/server';

// Etapa 1: e-mail + senha. A mensagem de erro é a mesma para senha errada e para quem não é admin (não revela quem é admin).
export async function entrar(f: FormData) {
  const email = String(f.get('email') ?? '').trim().slice(0, 254);
  const password = String(f.get('password') ?? '').slice(0, 200);
  if (!email || !password) redirect('/admin/login?erro=1');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect('/admin/login?erro=1');

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (perfil?.role !== 'admin') {
    await supabase.auth.signOut();
    redirect('/admin/login?erro=1');
  }
  redirect(await destinoMfa(supabase)); // aal1 -> /admin/login/2fa (ou /admin/seguranca se ainda não ativou)
}

// Etapa 2: código TOTP. challenge + verify elevam a sessão para aal2.
export async function verificarCodigo(f: FormData) {
  const code = String(f.get('code') ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) redirect('/admin/login/2fa?erro=1');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const fator = fatores?.totp.find(t => t.status === 'verified');
  if (!fator) redirect('/admin/seguranca');

  const { data: desafio, error: e1 } = await supabase.auth.mfa.challenge({ factorId: fator.id });
  if (e1 || !desafio) redirect('/admin/login/2fa?erro=2');
  const { error: e2 } = await supabase.auth.mfa.verify({ factorId: fator.id, challengeId: desafio.id, code });
  if (e2) redirect('/admin/login/2fa?erro=1');
  redirect('/admin');
}
