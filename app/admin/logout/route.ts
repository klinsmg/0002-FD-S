import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Só POST (um GET que desloga poderia ser disparado por qualquer link/imagem de outro site).
export async function POST(request: NextRequest) {
  await (await createClient()).auth.signOut();
  return NextResponse.redirect(new URL('/admin/login', request.url), 303);
}
