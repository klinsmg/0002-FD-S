import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import LimparCarrinho from '@/components/LimparCarrinho';
import { createClient } from '@/lib/supabase/server';
import { PONTO, STATUS, TIPO, data, reais } from '@/lib/conta';
import { info } from '@/lib/info';

export const metadata = { title: 'Seu pedido', robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Só o DONO vê o pedido: sem sessão vai ao login; com sessão, a consulta filtra por user_id (e o RLS também).
// Pedido de outra pessoa (ou inexistente) cai em 404 igual, sem revelar se existe.
export default async function Pedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: p } = await supabase
    .from('orders')
    .select('id, order_number, order_type, status, customer_name, notes, delivery_address, subtotal_cents, delivery_fee_cents, discount_cents, total_cents, has_price_pending, created_at, order_items(id, product_name, variant_label, quantity, doneness, notes, total_price_cents, price_pending, order_item_extras(name, quantity))')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!p) notFound();

  const end = p.delivery_address as Record<string, string> | null;
  const msg = [
    `*Pedido #${p.order_number} – MDogão Itapevi*`, '', `*Cliente:* ${p.customer_name}`,
    p.order_type === 'delivery' && end ? `*Entrega:* ${end.street}, ${end.number}${end.complement ? ` – ${end.complement}` : ''} – ${end.district} – ${end.city}/${end.state}` : '*Retirada na loja*',
    '', '*Itens*',
    ...p.order_items.map(i => `${i.quantity}x ${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ''}${i.doneness ? ` – ${PONTO[i.doneness]}` : ''}${i.order_item_extras.length ? ` + ${i.order_item_extras.map(x => `${x.quantity}x ${x.name}`).join(', ')}` : ''}`),
    '', `*Total:* ${reais(p.total_cents)}${p.has_price_pending ? ' + itens a confirmar' : ''}`, '', '_Taxa de entrega e pagamento combinados por aqui._',
  ].join('\n');

  return (
    <main>
      <LimparCarrinho />
      <header className="pg-cab wrap">
        <p className="script">pedido recebido</p>
        <h1>Pedido <em>#{p.order_number}</em></h1>
        <p>{data(p.created_at)} · {TIPO[p.order_type] ?? p.order_type} · {STATUS[p.status] ?? p.status}</p>
      </header>
      <div className="wrap conta-caixa">
        <ul className="canais">
          {p.order_items.map(i => (
            <li key={i.id}>
              <b>{i.quantity}× {i.product_name}{i.variant_label ? ` (${i.variant_label})` : ''}</b>
              <span>{i.price_pending ? 'a confirmar' : reais(i.total_price_cents)}</span>
              {(i.doneness || i.order_item_extras.length > 0 || i.notes) && (
                <small className="nota">{[i.doneness && PONTO[i.doneness], ...i.order_item_extras.map(x => `${x.quantity}× ${x.name}`), i.notes].filter(Boolean).join(' · ')}</small>
              )}
            </li>
          ))}
        </ul>
        {end && <p className="nota">Entrega em {end.street}, {end.number}{end.complement ? ` – ${end.complement}` : ''} · {end.district} · {end.city}/{end.state}</p>}
        <p className="conta-total">
          Subtotal {reais(p.subtotal_cents)} · Entrega {p.order_type === 'delivery' && p.delivery_fee_cents === 0 ? 'a combinar' : reais(p.delivery_fee_cents)}
          {p.discount_cents > 0 && <> · Desconto −{reais(p.discount_cents)}</>}<br />
          <b>Total {reais(p.total_cents)}{p.has_price_pending ? ' + itens a confirmar' : ''}</b>
        </p>

        <p className="nota">Seu pedido foi registrado. Para a loja começar o preparo e combinar pagamento{p.order_type === 'delivery' ? ' e taxa de entrega' : ''}, envie-o pelo WhatsApp:</p>
        <a className="btn btn-p" href={`https://wa.me/${info.wa}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">Enviar pelo WhatsApp</a>
        <p className="nota"><Link href="/conta/pedidos">Ver todos os meus pedidos</Link></p>
      </div>
    </main>
  );
}
