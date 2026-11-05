import { redirect } from 'next/navigation';
import { adminLogado, destinoMfa } from '@/lib/admin';
import { verificarCodigo } from '../actions';

export const metadata = { title: 'Verificação em duas etapas', robots: { index: false, follow: false } };

export default async function AdminLogin2fa({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { supabase } = await adminLogado();
  const destino = await destinoMfa(supabase);
  if (destino !== '/admin/login/2fa') redirect(destino); // já em aal2 -> painel; sem 2FA ativo -> ativação

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">segundo passo</p>
        <h1>Código do <em>autenticador</em></h1>
        <p>Digite o código de 6 dígitos do app autenticador.</p>
      </header>
      <div className="wrap conta-caixa">
        {erro && <p className="nota" role="alert">{erro === '2' ? 'Não foi possível iniciar a verificação. Tente novamente.' : 'Código inválido ou expirado.'}</p>}
        <form className="form" action={verificarCodigo}>
          <label htmlFor="a-cod">Código</label>
          <input id="a-cod" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus />
          <button className="btn btn-p" type="submit">Verificar</button>
        </form>
        <form action="/admin/logout" method="post"><button className="nota" type="submit">Cancelar e sair</button></form>
      </div>
    </main>
  );
}
