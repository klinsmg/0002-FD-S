import { exigirAdmin } from '@/lib/admin';
import MenuArea from '@/components/MenuArea';

const menu = [['Painel', '/admin'], ['Loja', '/admin/loja'], ['Pedidos', '/admin/pedidos'], ['Produtos', '/admin/produtos'], ['Categorias', '/admin/categorias'], ['Relatórios', '/admin/relatorios'], ['Configurações', '/admin/configuracoes']] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirAdmin();
  return (
    <div className="area area-adm">
      <MenuArea itens={menu} rotulo="Painel administrativo">
        <form action="/admin/logout" method="post"><button type="submit">Sair</button></form>
      </MenuArea>
      {children}
    </div>
  );
}
