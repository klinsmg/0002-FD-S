import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Segurança da conta' };

// Página reservada: a verificação em duas etapas (2FA) opcional ainda não existe. Nada aqui altera dados.
export default async function Seguranca() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect('/login');
  const provedor = user.app_metadata?.provider === 'google' ? 'Google' : String(user.app_metadata?.provider ?? 'e-mail');

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">sua conta</p>
        <h1>Segurança da <em>conta</em></h1>
      </header>
      <div className="wrap conta-caixa">
        <ul className="canais">
          <li><b>Forma de entrada</b><span>{provedor}</span></li>
          <li><b>E-mail</b><span>{user.email}</span></li>
          <li><b>Verificação em duas etapas</b><span>Em breve (opcional)</span></li>
        </ul>
        <p className="nota">Você entra com a sua conta {provedor}; a senha fica com eles e nunca passa por aqui. Quando a verificação em duas etapas estiver disponível, você poderá ativá-la nesta página.</p>
      </div>
    </main>
  );
}
