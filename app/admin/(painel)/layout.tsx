import { exigirAdmin } from '@/lib/admin';
import MenuArea from '@/components/MenuArea';
import AoVivo from '@/components/AoVivo';

// ordem de uso no dia a dia: o quadro da loja primeiro; consulta no meio; ajustes e auditoria no fim
const menu = [['Loja', '/admin/loja'], ['Pedidos', '/admin/pedidos'], ['Painel', '/admin'], ['Produtos', '/admin/produtos'], ['Categorias', '/admin/categorias'], ['Relatórios', '/admin/relatorios'], ['Mapas', '/admin/mapas'], ['Auditoria', '/admin/auditoria'], ['Configurações', '/admin/configuracoes']] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirAdmin();
  return (
    <div className="area area-adm">
      <MenuArea itens={menu} rotulo="Painel administrativo">
        {/* pedidos novos e mudanças de status chegam na hora em todas as telas do painel */}
        <AoVivo topico="loja" reserva={15} alertaNovo />
        <form action="/admin/logout" method="post"><button type="submit">Sair</button></form>
      </MenuArea>
      {children}
    </div>
  );
}
