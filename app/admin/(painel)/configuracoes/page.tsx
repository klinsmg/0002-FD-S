import Link from 'next/link';
import { exigirAdmin } from '@/lib/admin';

export const metadata = { title: 'Configurações' };

// Configurações do administrador: conta, segurança (2FA) e senha. Só abre com admin + AAL2 (exigirAdmin).
// A ativação do 2FA continua em /admin/seguranca, porque precisa abrir antes do AAL2.
export default async function ConfiguracoesAdmin() {
  const { supabase, user } = await exigirAdmin();
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const totp = fatores?.totp.find(t => t.status === 'verified');

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1><em>Configurações</em></h1>
      </header>
      <div className="wrap conta-caixa">
        <nav className="conta-ancoras" aria-label="Seções">
          <a href="#conta">Conta</a><a href="#seguranca">Segurança</a>
        </nav>

        <section id="conta" aria-labelledby="t-conta">
          <h2 className="conta-tit" id="t-conta">Conta</h2>
          <ul className="canais">
            <li><b>E-mail</b><span>{user.email}</span></li>
            <li><b>Forma de entrada</b><span>E-mail e senha + código do autenticador</span></li>
          </ul>
        </section>

        <section id="seguranca" aria-labelledby="t-seg">
          <h2 className="conta-tit" id="t-seg">Segurança</h2>
          <ul className="canais">
            <li><b>Verificação em duas etapas</b><span>{totp ? 'Ativa (obrigatória)' : 'Não ativada'}</span></li>
            {totp && <li><b>Ativada em</b><span>{new Date(totp.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></li>}
          </ul>
          <p className="nota"><Link href="/admin/senha">Trocar a senha</Link> (enviamos um link para o seu e-mail).</p>
          <form action="/admin/logout" method="post"><button type="submit" className="btn btn-o">Sair do painel</button></form>
        </section>
      </div>
    </main>
  );
}
