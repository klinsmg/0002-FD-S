import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { entrar } from './actions';

export const metadata = { title: 'Entrar no painel', robots: { index: false, follow: false } };

// Só e-mail e senha: de propósito, sem Google/Apple. Quem já está em aal2 vai direto ao painel.
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel === 'aal2') redirect('/admin');
  }
  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">área restrita</p>
        <h1>Painel <em>MDogão</em></h1>
      </header>
      <div className="wrap conta-caixa">
        {erro && <p className="nota" role="alert">E-mail ou senha inválidos.</p>}
        <form className="form" action={entrar}>
          <label htmlFor="a-email">E-mail</label>
          <input id="a-email" name="email" type="email" autoComplete="username" required maxLength={254} />
          <label htmlFor="a-senha">Senha</label>
          <input id="a-senha" name="password" type="password" autoComplete="current-password" required maxLength={200} />
          <button className="btn btn-p" type="submit">Continuar</button>
        </form>
        <p className="nota"><a href="/admin/senha">Definir ou recuperar senha</a></p>
      </div>
    </main>
  );
}
