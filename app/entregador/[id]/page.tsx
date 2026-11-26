import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { entregadorAtual, ETAPA_ENTREGA } from '@/lib/entregador';
import { PAGAMENTO, enderecoTexto } from '@/lib/admin';
import { PONTO, reais } from '@/lib/conta';
import BaixaEntrega from '@/components/BaixaEntrega';

export const metadata = { title: 'Entrega', robots: { index: false, follow: false }, manifest: '/entregador.webmanifest' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Uma entrega: dados do pedido, rota no app de mapas (pelo endereço) e a baixa. Sem GPS: o entregador só confirma.
export default async function Entrega({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, user, liberado } = await entregadorAtual();
  if (!user || !liberado) redirect('/entregador');

  // RLS: só a entrega deste entregador (e o pedido dela) aparece
  const { data: e } = await supabase.from('deliveries')
    .select('id, status, orders(order_number, customer_name, customer_phone, delivery_address, notes, payment_method, total_cents, has_price_pending, order_items(id, quantity, product_name, variant_label, doneness, notes))')
    .eq('id', id).maybeSingle();
  if (!e || !e.orders) notFound();
  const o = e.orders;
  const fone = (o.customer_phone ?? '').replace(/\D/g, '');
  const endereco = enderecoTexto(o.delivery_address);

  return (
    <main className="wrap conta-caixa entr">
      <p className="nota"><Link href="/entregador">← Minhas entregas</Link></p>
      <header className="pg-cab">
        <p className="script">entrega</p>
        <h1>Pedido <em>#{o.order_number}</em></h1>
        <p>{ETAPA_ENTREGA[e.status] ?? e.status}</p>
      </header>

      <ul className="canais">
        <li><b>Cliente</b><span>{o.customer_name}{fone && <> · <a href={`tel:${fone}`}>{o.customer_phone}</a></>}</span></li>
        <li><b>Endereço</b><span>{endereco}</span></li>
        <li><b>Pagamento</b><span>{o.payment_method ? PAGAMENTO[o.payment_method] ?? o.payment_method : 'A combinar'} · {reais(o.total_cents)}{o.has_price_pending ? ' +' : ''}</span></li>
        {o.notes && <li><b>Observações</b><span>{o.notes}</span></li>}
      </ul>
      <details className="ent-itens">
        <summary>Itens do pedido ({o.order_items.reduce((n, i) => n + i.quantity, 0)})</summary>
        <ul>{o.order_items.map(i => <li key={i.id}>{i.quantity}× {i.product_name}{i.variant_label ? ` (${i.variant_label})` : ''}{i.doneness ? ` · ${PONTO[i.doneness]}` : ''}{i.notes ? ` · ${i.notes}` : ''}</li>)}</ul>
      </details>

      {e.status === 'assigned' ? (
        <BaixaEntrega id={e.id} rota={endereco ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}` : ''} />
      ) : (
        <p className="nota" role="status">Esta entrega está encerrada ({(ETAPA_ENTREGA[e.status] ?? e.status).toLowerCase()}). <Link href="/entregador">Voltar para as entregas</Link></p>
      )}
    </main>
  );
}
