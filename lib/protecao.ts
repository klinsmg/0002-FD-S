import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

// Limite de tentativas nos pontos sensíveis (criar pedido, login do painel, código 2FA).
// Chaves: usuário logado (vem do JWT, no banco) + IP + dispositivo. IP sozinho não basta (Wi-Fi/4G compartilhado), por isso
// o teto por IP é maior. Dispositivo = um ID aleatório nosso em cookie httpOnly (sem fingerprinting); apagar o cookie só
// zera essa chave, usuário e IP continuam valendo. Regras, bloqueio de 15 min e registro: função access_check (migration 014).
// Só para Server Actions / Route Handlers (grava o cookie).
const COOKIE_DISP = 'disp';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function permitir(acao: 'pedido' | 'login_admin' | 'codigo_2fa'): Promise<boolean> {
  const h = await headers();
  // na Vercel, x-real-ip / o 1º item do x-forwarded-for são preenchidos pela própria plataforma
  const ip = (h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? '').trim().slice(0, 64) || null;
  const jar = await cookies();
  let disp = jar.get(COOKIE_DISP)?.value ?? '';
  if (!UUID.test(disp)) {
    disp = crypto.randomUUID();
    jar.set(COOKIE_DISP, disp, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('access_check', { p_action: acao, p_ip: ip ?? '', p_device: disp });
  // ponytail: falha do banco deixa passar (não derruba pedido/login); o limite diário e o do Supabase Auth seguem valendo
  if (error) { console.error('[protecao] access_check falhou', acao, error.message); return true; }
  if (data === false) console.warn('[protecao] bloqueado', acao, { ip, disp: disp.slice(0, 8) });
  return data !== false;
}
