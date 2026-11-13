import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/lib/supabase/server';
import MenuArea from '@/components/MenuArea';
import ConviteAvaliacao from '@/components/ConviteAvaliacao';
import { avaliarNoGoogle } from '@/lib/info';

export const metadata = { title: 'Minha conta', robots: { index: false, follow: false } };

const menu = [['Resumo', '/conta'], ['Pedidos', '/conta/pedidos'], ['Configurações', '/conta/configuracoes']] as const;

// Protege toda a área do cliente: sem sessão válida, vai para /login.
export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const { user } = await usuarioAtual();
  if (!user) redirect('/login');
  return (
    <div className="area">
      <MenuArea itens={menu} rotulo="Minha conta" completo />
      {children}
      <ConviteAvaliacao google={avaliarNoGoogle} />
    </div>
  );
}
