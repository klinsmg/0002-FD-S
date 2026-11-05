import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Minha conta', robots: { index: false, follow: false } };

const menu = [['Resumo', '/conta'], ['Endereços', '/conta/enderecos'], ['Pedidos', '/conta/pedidos'], ['Segurança', '/conta/seguranca']] as const;

// Protege toda a área do cliente: sem sessão válida (checada no Supabase), vai para /login.
export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect('/login');
  return (
    <>
      <nav className="wrap conta-menu" aria-label="Minha conta">
        {menu.map(([t, h]) => <Link key={h} href={h}>{t}</Link>)}
      </nav>
      {children}
    </>
  );
}
