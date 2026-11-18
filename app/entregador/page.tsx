import Link from 'next/link';
import { entregadorAtual, ATIVAS, ETAPA_ENTREGA } from '@/lib/entregador';
import { enderecoTexto } from '@/lib/admin';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import Recarregar from '@/components/Recarregar';

export const metadata = { title: 'Entregador', robots: { index: false, follow: false } };

// App do entregador (no navegador do celular). Entra com Google; o admin libera a conta em Configurações > Entregadores.
export default async function Entregador() {
  const { supabase, user, liberado } = await entregadorAtual();

  if (!user) {
    return (
      <main className="wrap conta-caixa ent">
        <header className="pg-cab"><p className="script">área do</p><h1><em>Entregador</em></h1></header>
        <p>Entre com a sua conta Google para ver as entregas que a loja mandou para você.</p>
        <SocialLoginButtons destino="entregador" />
      </main>
    );
  }
  if (!liberado) {
    return (
      <main className="wrap conta-caixa ent">
        <header className="pg-cab"><p className="script">área do</p><h1><em>Entregador</em></h1></header>
        <p>Sua conta ainda não está liberada como entregador.</p>
        <p className="nota">Peça para a loja liberar o e-mail <b>{user.email}</b> em Configurações › Entregadores. Depois, é só atualizar esta página.</p>
      </main>
    );
  }

  const { data: entregas } = await supabase
    .from('deliveries')
    .select('id, status, created_at, orders(order_number, customer_name, delivery_address, total_cents)')
    .in('status', [...ATIVAS])
    .order('created_at');

  return (
    <main className="wrap conta-caixa ent">
      <Recarregar segundos={20} />
      <header className="pg-cab"><p className="script">área do</p><h1><em>Entregador</em></h1></header>
      {!entregas?.length && <p className="nota">Nenhuma entrega com você agora. Quando a loja te mandar uma, ela aparece aqui.</p>}
      <ul className="ped-lista">
        {entregas?.map(e => (
          <li key={e.id}>
            <Link href={`/entregador/${e.id}`}>
              <b>Pedido #{e.orders?.order_number}</b>
              <span className={`val st st-${e.status === 'assigned' ? 'ready' : 'out_for_delivery'}`}>{ETAPA_ENTREGA[e.status]}</span>
              <small>{e.orders?.customer_name} · {enderecoTexto(e.orders?.delivery_address)}</small>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
