import Link from 'next/link';
import { exigirAdmin } from '@/lib/admin';

const menu = [['Painel', '/admin'], ['Pedidos', '/admin/pedidos'], ['Produtos', '/admin/produtos'], ['Categorias', '/admin/categorias'], ['Relatórios', '/admin/relatorios'], ['Segurança', '/admin/seguranca']] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirAdmin();
  return (
    <>
      <nav className="wrap conta-menu" aria-label="Painel administrativo">
        {menu.map(([t, h]) => <Link key={h} href={h}>{t}</Link>)}
        <form action="/admin/logout" method="post"><button type="submit">Sair</button></form>
      </nav>
      {children}
    </>
  );
}
