import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PONTO, STATUS, TIPO, data, reais } from '@/lib/conta';

export const metadata = { title: 'Meus pedidos' };

export default async function Pedidos() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS: só os pedidos do próprio cliente (e os itens/extras deles). Limite de 100 para não pesar a página.
  const { data: pedidos } = await supabase
    .from('orders')
    .select('id, order_number, order_type, status, subtotal_cents, delivery_fee_cents, discount_cents, total_cents, has_price_pending, created_at, order_items(id, product_name, variant_label, quantity, doneness, notes, total_price_cents, price_pending, order_item_extras(name, quantity))')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">sua conta</p>
        <h1>Meus <em>pedidos</em></h1>
      </header>
      <div className="wrap conta-caixa">
        {pedidos?.length ? pedidos.map(p => (
          <section className="conta-pedido" key={p.id}>
            <h2>Pedido #{p.order_number}</h2>
            <p className="nota">{data(p.created_at)} · {TIPO[p.order_type] ?? p.order_type} · {STATUS[p.status] ?? p.status}</p>
            <ul className="canais">
              {p.order_items.map(i => (
                <li key={i.id}>
                  <b>{i.quantity}× {i.product_name}{i.variant_label ? ` (${i.variant_label})` : ''}</b>
                  <span>{i.price_pending ? 'a confirmar' : reais(i.total_price_cents)}</span>
                  {(i.doneness || i.order_item_extras.length > 0 || i.notes) && (
                    <small className="nota">
                      {[i.doneness && PONTO[i.doneness], ...i.order_item_extras.map(x => `${x.quantity}× ${x.name}`), i.notes].filter(Boolean).join(' · ')}
                    </small>
                  )}
                </li>
              ))}
            </ul>
            <p className="conta-total">
              {p.delivery_fee_cents > 0 && <>Entrega {reais(p.delivery_fee_cents)} · </>}
              {p.discount_cents > 0 && <>Desconto −{reais(p.discount_cents)} · </>}
              <b>Total {reais(p.total_cents)}{p.has_price_pending ? ' + itens a confirmar' : ''}</b>
            </p>
          </section>
        )) : (
          <p className="nota">Você ainda não fez pedidos.</p>
        )}
      </div>
    </main>
  );
}
