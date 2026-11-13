'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const txt = (v: unknown) => (typeof v === 'string' ? v : '');

export async function enviarLinkSenha(email: string): Promise<{ erro?: string }> {
  const e = txt(email).trim().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { erro: 'Informe um e-mail válido.' };
  const origem = (await headers()).get('origin');
  const { error } = await (await createClient()).auth.resetPasswordForEmail(e, { redirectTo: `${origem}/admin/senha` });
  // limite de envio / falha do serviço de e-mail não dependem da conta existir, então podem ser mostrados; o resto responde igual
  if (error && (error.status === 429 || error.status === 500 || /rate|limit|smtp|sending/i.test(error.message))) {
    return { erro: error.status === 429 || /rate|limit/i.test(error.message) ? 'Limite de envios do Supabase atingido. Aguarde alguns minutos (ou configure um SMTP próprio).' : 'O Supabase não conseguiu enviar o e-mail (verifique o SMTP).' };
  }
  return {};
}

// Abre a sessão de recuperação no servidor (cookies httpOnly): link com ?code (PKCE) ou com tokens no #hash (formato antigo).
export async function abrirLinkSenha(p: { code?: string; access_token?: string; refresh_token?: string }): Promise<boolean> {
  const supabase = await createClient();
  if (txt(p.access_token) && txt(p.refresh_token)) return !(await supabase.auth.setSession({ access_token: txt(p.access_token), refresh_token: txt(p.refresh_token) })).error;
  if (txt(p.code)) return !(await supabase.auth.exchangeCodeForSession(txt(p.code))).error;
  return false;
}

export async function salvarSenha(senha: string): Promise<{ erro: string }> {
  const s = txt(senha);
  if (s.length < 12 || s.length > 200) return { erro: 'Use de 12 a 200 caracteres.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: 'Link expirado. Peça um novo.' };
  const { error } = await supabase.auth.updateUser({ password: s });
  if (error) return { erro: 'Não foi possível salvar a senha. Peça um novo link.' };
  redirect('/admin'); // o guarda leva ao código 2FA ou à ativação
}
