import { ehDev, exigirAdmin } from '@/lib/admin';
import MenuArea from '@/components/MenuArea';
import AoVivo from '@/components/AoVivo';

// ordem de uso no dia a dia: o quadro da loja primeiro; consulta no meio; ajustes no fim.
// Sistemas técnicos (mapas/Google/VPS, auditoria) ficam na área Dev: só aparecem (e só abrem) para ADMIN_DEV_EMAILS.
const menuLoja = [['Loja', '/admin/loja'], ['Pedidos', '/admin/pedidos'], ['Painel', '/admin'], ['Produtos', '/admin/produtos'], ['Categorias', '/admin/categorias'], ['Relatórios', '/admin/relatorios'], ['Configurações', '/admin/configuracoes']] as const;
const menuDev = [['Dev · Mapas', '/admin/mapas'], ['Dev · Auditoria', '/admin/auditoria']] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await exigirAdmin();
  const menu = ehDev(user.email) ? [...menuLoja, ...menuDev] : menuLoja;
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
