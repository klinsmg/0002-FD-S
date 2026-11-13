import type { CookieOptions } from '@supabase/ssr';

// Cookies da sessão do Supabase (access + refresh token): httpOnly, então nenhum JavaScript do navegador lê o token;
// secure em produção (só HTTPS). Todo acesso ao Supabase com sessão acontece no servidor.
export const COOKIE_SESSAO = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' } as const;

// "Manter conectado" desmarcado no login grava manter=0 (cookie de sessão do navegador).
export const COOKIE_MANTER = 'manter';

// O @supabase/ssr sempre grava maxAge de 400 dias. Sem "manter conectado", tira o maxAge: o cookie vira de sessão e some
// quando o navegador fecha. maxAge 0 (apagar cookie) passa intacto.
export const ajustarCookie = (o: CookieOptions | undefined, manter: boolean): CookieOptions =>
  manter || o?.maxAge === 0 ? { ...o } : { ...o, maxAge: undefined };
