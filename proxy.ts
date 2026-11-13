import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_MANTER, COOKIE_SESSAO, ajustarCookie } from '@/lib/supabase/sessao';

// Renova a sessão do Supabase (cookies) só nas rotas de conta/admin/login. O resto do site continua estático e não passa por aqui.
// A proteção de /conta em si está em app/conta/layout.tsx (getUser valida o token no servidor do Supabase).
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const manter = request.cookies.get(COOKIE_MANTER)?.value !== '0';
  const supabase = createServerClient(url, key, {
    cookieOptions: COOKIE_SESSAO,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(lista) {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => response.cookies.set(name, value, ajustarCookie(options, manter)));
      },
    },
  });
  await supabase.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/conta/:path*', '/admin/:path*', '/login'] };
