import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { entregadorAtual, ATIVAS, ETAPA_ENTREGA } from '@/lib/entregador';
import { PAGAMENTO, enderecoTexto } from '@/lib/admin';
import { PONTO, reais } from '@/lib/conta';
import Rastreador from '@/components/Rastreador';

export const metadata = { title: 'Entrega', robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Entrega({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, user, liberado } = await entregadorAtual();
  if (!user || !liberado) redirect('/entregador');

  // RLS: só a entrega deste entregador (e o pedido dela) aparece
  const [{ data: e }, { data: loja }] = await Promise.all([
    supabase.from('deliveries')
      .select('id, status, dest_lat, dest_lng, dest_approx, orders(order_number, customer_name, customer_phone, delivery_address, notes, payment_method, total_cents, has_price_pending, order_items(id, quantity, product_name, variant_label, doneness, notes))')
      .eq('id', id).maybeSingle(),
    supabase.from('store_settings').select('delivery_confirm_radius_m, gps_max_accuracy_m').maybeSingle(),
  ]);
  if (!e || !e.orders) notFound();
  const o = e.orders;
  const ativa = (ATIVAS as readonly string[]).includes(e.status);
  const fone = (o.customer_phone ?? '').replace(/\D/g, '');

  return (
    <main className="wrap conta-caixa ent">
      <p className="nota"><Link href="/entregador">← Minhas entregas</Link></p>
      <header className="pg-cab">
        <p className="script">entrega</p>
        <h1>Pedido <em>#{o.order_number}</em></h1>
        <p>{ETAPA_ENTREGA[e.status]}</p>
      </header>

      <ul className="canais">
        <li><b>Cliente</b><span>{o.customer_name}{fone && <> · <a href={`tel:${fone}`}>{o.customer_phone}</a></>}</span></li>
        <li><b>Endereço</b><span>{enderecoTexto(o.delivery_address)}</span></li>
        <li><b>Pagamento</b><span>{o.payment_method ? PAGAMENTO[o.payment_method] ?? o.payment_method : 'A combinar'} · {reais(o.total_cents)}{o.has_price_pending ? ' +' : ''}</span></li>
        {o.notes && <li><b>Observações</b><span>{o.notes}</span></li>}
      </ul>
      <details className="ent-itens">
        <summary>Itens do pedido ({o.order_items.reduce((n, i) => n + i.quantity, 0)})</summary>
        <ul>{o.order_items.map(i => <li key={i.id}>{i.quantity}× {i.product_name}{i.variant_label ? ` (${i.variant_label})` : ''}{i.doneness ? ` · ${PONTO[i.doneness]}` : ''}{i.notes ? ` · ${i.notes}` : ''}</li>)}</ul>
      </details>

      {ativa && e.dest_approx && <p className="nota" role="note">O endereço foi localizado só de forma aproximada no mapa. Confirme a casa com o cliente; o botão &quot;Entregue&quot; libera a até 300 m.</p>}
      {ativa ? (
        <Rastreador id={e.id} destino={{ lat: e.dest_lat, lng: e.dest_lng }}
          raio={e.dest_approx ? Math.max(loja?.delivery_confirm_radius_m ?? 50, 300) : (loja?.delivery_confirm_radius_m ?? 50)} precisaoMax={loja?.gps_max_accuracy_m ?? 30} iniciada={e.status !== 'assigned'} />
      ) : (
        <p className="nota" role="status">Esta entrega está encerrada ({ETAPA_ENTREGA[e.status].toLowerCase()}). A localização não é mais coletada.</p>
      )}
    </main>
  );
}
