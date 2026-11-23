import Link from 'next/link';
import { entregadorAtual, ATIVAS, ETAPA_ENTREGA } from '@/lib/entregador';
import { enderecoTexto } from '@/lib/admin';
import { reais } from '@/lib/conta';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import Recarregar from '@/components/Recarregar';

// PWA do entregador (instalável, mobile-first): manifesto com escopo /entregador
export const metadata = { title: 'Entregador', robots: { index: false, follow: false }, manifest: '/entregador.webmanifest' };

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

  const semana = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: entregas }, { data: feitas }] = await Promise.all([
    supabase.from('deliveries')
      .select('id, status, created_at, orders(order_number, customer_name, delivery_address, total_cents)')
      .in('status', [...ATIVAS]).eq('courier_id', user.id).order('created_at'),
    supabase.from('deliveries')
      .select('finished_at, orders(delivery_fee_cents)')
      .eq('status', 'delivered').eq('courier_id', user.id).gte('finished_at', semana).limit(500),
  ]);
  // resumo: "hoje" no fuso de São Paulo
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const dia = (d: string | null) => (d ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(d)) : '');
  const deHoje = (feitas ?? []).filter(f => dia(f.finished_at) === hoje);
  const taxas = (feitas ?? []).reduce((t, f) => t + (f.orders?.delivery_fee_cents ?? 0), 0);

  return (
    <main className="wrap conta-caixa ent">
      <Recarregar segundos={20} />
      <header className="pg-cab"><p className="script">área do</p><h1><em>Entregador</em></h1></header>
      <ul className="ent-resumo" aria-label="Seu resumo">
        <li><b>{deHoje.length}</b><span>entregas hoje</span></li>
        <li><b>{feitas?.length ?? 0}</b><span>nos últimos 7 dias</span></li>
        <li><b>{reais(taxas)}</b><span>em taxas de entrega (7 dias)</span></li>
      </ul>
      <h2 className="conta-tit">Para entregar agora</h2>
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
