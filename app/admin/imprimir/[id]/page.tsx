import { notFound } from 'next/navigation';
import { PAGAMENTO, enderecoTexto, exigirAdmin } from '@/lib/admin';
import { PONTO, data, reais } from '@/lib/conta';
import ImprimirAuto from '@/components/ImprimirAuto';

export const metadata = { title: 'Imprimir pedido', robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cupom para impressora térmica (58 ou 80 mm), preto e branco, em duas vias: COZINHA (sem preços, itens grandes)
// e ENTREGA (cliente, endereço, pagamento e valores). Cada via sai em uma página. Fora do layout do painel de propósito.
export default async function Imprimir({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ l?: string }> }) {
  const [{ id }, { l }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const largura = l === '58' ? '58' : '80';
  const { supabase } = await exigirAdmin();
  const { data: p } = await supabase.from('orders')
    .select('order_number, created_at, customer_name, customer_phone, order_type, notes, delivery_address, payment_method, subtotal_cents, delivery_fee_cents, discount_cents, total_cents, has_price_pending, order_items(id, quantity, product_name, variant_label, doneness, notes, total_price_cents, price_pending, order_item_extras(name, quantity))')
    .eq('id', id).maybeSingle();
  if (!p) notFound();
  const entrega = p.order_type === 'delivery';
  const tipo = entrega ? 'ENTREGA' : 'RETIRADA';
  const detalhe = (i: (typeof p.order_items)[number]) => [i.doneness && PONTO[i.doneness], ...i.order_item_extras.map(x => `+${x.quantity}x ${x.name}`)].filter(Boolean).join(' / ');

  return (
    <div className={`cupons l${largura}`}>
      <ImprimirAuto largura={largura} />

      <section className="cupom">
        <p className="cupom-via">COZINHA</p>
        <p className="cupom-num">#{p.order_number}</p>
        <p className="cupom-c">{data(p.created_at)} · {tipo}</p>
        <p className="cupom-c">{p.customer_name}</p>
        <hr />
        {p.order_items.map(i => (
          <div key={i.id} className="cupom-item grande">
            <p><b>{i.quantity}x {i.product_name}{i.variant_label ? ` (${i.variant_label})` : ''}</b></p>
            {detalhe(i) && <p>{detalhe(i)}</p>}
            {i.notes && <p className="cupom-obs">** {i.notes} **</p>}
          </div>
        ))}
        {p.notes && <><hr /><p className="cupom-obs">OBS: {p.notes}</p></>}
        <hr />
      </section>

      <section className="cupom">
        <p className="cupom-via">{tipo}</p>
        <p className="cupom-num">#{p.order_number}</p>
        <p className="cupom-c">{data(p.created_at)}</p>
        <hr />
        <p><b>{p.customer_name}</b></p>
        {p.customer_phone && <p>Tel: {p.customer_phone}</p>}
        {entrega && <p>{enderecoTexto(p.delivery_address) || 'Endereço não informado'}</p>}
        <hr />
        {p.order_items.map(i => (
          <div key={i.id} className="cupom-item">
            <p className="cupom-linha"><span>{i.quantity}x {i.product_name}{i.variant_label ? ` (${i.variant_label})` : ''}</span><span>{i.price_pending ? 'a conf.' : reais(i.total_price_cents)}</span></p>
            {detalhe(i) && <p>{detalhe(i)}</p>}
            {i.notes && <p className="cupom-obs">** {i.notes} **</p>}
          </div>
        ))}
        {p.notes && <p className="cupom-obs">OBS: {p.notes}</p>}
        <hr />
        <p className="cupom-linha"><span>Subtotal</span><span>{reais(p.subtotal_cents)}</span></p>
        {p.delivery_fee_cents > 0 && <p className="cupom-linha"><span>Entrega</span><span>{reais(p.delivery_fee_cents)}</span></p>}
        {p.discount_cents > 0 && <p className="cupom-linha"><span>Desconto</span><span>-{reais(p.discount_cents)}</span></p>}
        <p className="cupom-linha cupom-total"><span>TOTAL</span><span>{reais(p.total_cents)}</span></p>
        {p.has_price_pending && <p>+ itens com valor a confirmar</p>}
        <p>Pagamento: {p.payment_method ? PAGAMENTO[p.payment_method] ?? p.payment_method : 'a definir'}</p>
        <hr />
        <p className="cupom-c">MDogão Itapevi</p>
      </section>
    </div>
  );
}
