import { cookies, headers } from 'next/headers';
import { usuarioAtual } from '@/lib/supabase/server';
import { clienteServico, ipLog } from '@/lib/supabase/servico';

// Limite de tentativas nos pontos sensíveis (criar pedido, login do painel, código 2FA).
// Chaves: usuário logado + IP + dispositivo. IP sozinho não basta (Wi-Fi/4G compartilhado), por isso o teto por IP é
// maior. Dispositivo = um ID aleatório nosso em cookie httpOnly (sem fingerprinting); apagar o cookie só zera essa chave.
// Regras, bloqueio de 15 min e registro: função access_check (migrações 014 e 019). Só o servidor chama a função
// (service_role), informando o IP real e o usuário já verificado: ninguém consegue forjar IP pela API.
// Só para Server Actions / Route Handlers (grava o cookie).
const COOKIE_DISP = 'disp';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ipDaRequisicao() {
  const h = await headers();
  // na Vercel, x-real-ip / o 1º item do x-forwarded-for são preenchidos pela própria plataforma
  return (h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? '').trim().slice(0, 64) || null;
}

export async function permitir(acao: 'pedido' | 'login_admin' | 'codigo_2fa'): Promise<boolean> {
  const ip = await ipDaRequisicao();
  const jar = await cookies();
  let disp = jar.get(COOKIE_DISP)?.value ?? '';
  if (!UUID.test(disp)) {
    disp = crypto.randomUUID();
    jar.set(COOKIE_DISP, disp, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  const servico = clienteServico();
  if (!servico) return true; // ponytail: sem a chave secreta configurada, não bloqueia (o limite diário do banco segue valendo)
  const { user } = await usuarioAtual();
  const { data, error } = await servico.rpc('access_check', { p_action: acao, p_ip: ip ?? '', p_device: disp, p_user: user?.id ?? (null as unknown as string) });
  // falha do banco deixa passar (não derruba pedido/login); o limite diário e o do Supabase Auth seguem valendo
  if (error) { console.error('[protecao] access_check falhou', acao, error.message); return true; }
  if (data === false) console.warn('[protecao] bloqueado', acao, { ip: ipLog(ip), disp: disp.slice(0, 8) });
  return data !== false;
}

// Acesso negado (ex.: GPS para entrega de outro entregador): vai para o registro de segurança
export async function registrarNegado(usuario: string | null) {
  const servico = clienteServico();
  if (!servico) return;
  const disp = (await cookies()).get(COOKIE_DISP)?.value ?? '';
  await servico.rpc('log_denied', { p_ip: (await ipDaRequisicao()) ?? '', p_device: disp, p_user: usuario as string });
}
