import Link from 'next/link';
import { redirect } from 'next/navigation';
import AtivarTotp from '@/components/AtivarTotp';
import { adminLogado, destinoMfa } from '@/lib/admin';

export const metadata = { title: 'Segurança do painel', robots: { index: false, follow: false } };

export default async function AdminSeguranca() {
  const { supabase, user } = await adminLogado();
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const ativo = !!fatores?.totp.some(t => t.status === 'verified');
  // 2FA já ativo mas sessão ainda sem o código: precisa passar por /admin/login/2fa antes (não dá para trocar o fator sem provar o atual)
  if (ativo && (await destinoMfa(supabase)) !== '/admin') redirect('/admin/login/2fa');

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1>Segurança do <em>painel</em></h1>
      </header>
      <div className="wrap conta-caixa">
        <ul className="canais">
          <li><b>E-mail</b><span>{user.email}</span></li>
          <li><b>Verificação em duas etapas</b><span>{ativo ? 'Ativa (obrigatória)' : 'Não ativada'}</span></li>
        </ul>
        {ativo
          ? <p className="nota">O 2FA está ativo. Todo acesso ao painel pede o código do autenticador. <Link href="/admin">Ir para o painel</Link></p>
          : <>
              <p className="nota">O painel só abre depois de ativar o 2FA. Leia o QR Code com Google Authenticator, Authy ou similar e confirme com o código de 6 dígitos.</p>
              <AtivarTotp />
            </>}
      </div>
    </main>
  );
}
