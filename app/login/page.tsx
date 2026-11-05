import { redirect } from 'next/navigation';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Entrar', description: 'Entre na sua conta MDogão com o Google para ver seus pedidos.', robots: { index: false, follow: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (user) redirect('/conta');

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">sua conta</p>
        <h1>Entrar no <em>MDogão</em></h1>
        <p>Entre com o Google para acompanhar seus pedidos.</p>
      </header>
      <div className="wrap conta-caixa">
        <SocialLoginButtons falhou={erro === '1'} />
        <p className="nota">Usamos só seu nome e e-mail do Google para criar a conta. Veja a <a href="/politica-de-privacidade">Política de Privacidade</a>.</p>
      </div>
    </main>
  );
}
