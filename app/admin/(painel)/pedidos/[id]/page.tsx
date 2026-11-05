import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PAGAMENTO, STATUS_LISTA, doisDec, exigirAdmin } from '@/lib/admin';
import { PONTO, STATUS, TIPO, data, reais } from '@/lib/conta';
import { atualizarPedido, definirValores } from '@/app/admin/(painel)/actions';

export const metadata = { title: 'Pedido' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG: Record<string, string> = {
  invalido: 'Status ou pagamento inválido.', falha: 'Não foi possível salvar. Tente novamente.',
  valor: 'Confira os valores (use vírgula: 8,00).', fechado: 'Só dá para mudar taxa/desconto de pedido aberto (recebido ou confirmado).',
};

export default async function PedidoAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { id } = await params;
  const { ok, erro } = await searchParams;
  if (!UUID.test(id)) notFound();
  const { supabase } = await exigirAdmin();

  const { data: p } = await supabase
    .from('orders')
    .select('*, order_items(id, product_name, variant_label, quantity, doneness, notes, total_price_cents, price_pending, order_item_extras(name, quantity))')
    .eq('id', id).maybeSingle();
  if (!p) notFound();
  const { data: perfil } = p.user_id ? await supabase.from('profiles').select('full_name, phone').eq('id', p.user_id).maybeSingle() : { data: null };
  const end = p.delivery_address as Record<string, string> | null;
  const aberto = p.status === 'pending' || p.status === 'confirmed';

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1>Pedido <em>#{p.order_number}</em></h1>
        <p>{data(p.created_at)} · {TIPO[p.order_type] ?? p.order_type} · {STATUS[p.status]}</p>
      </header>
      <div className="wrap adm-caixa">
        <p className="nota"><Link href="/admin/pedidos">← Voltar aos pedidos</Link></p>
        {ok && <p className="nota" role="status">Salvo.</p>}
        {erro && MSG[erro] && <p className="nota" role="alert">{MSG[erro]}</p>}

        <h2 className="conta-tit">Cliente</h2>
        <ul className="canais">
          <li><b>Nome no pedido</b><span>{p.customer_name}</span></li>
          <li><b>Telefone do pedido</b><span>{p.customer_phone ?? 'não informado'}</span></li>
          <li><b>Conta</b><span>{perfil ? `${perfil.full_name ?? 'sem nome'}${perfil.phone ? ` · ${perfil.phone}` : ''}` : 'conta removida'}</span></li>
          {end && <li><b>Endereço</b><span>{end.street}, {end.number}{end.complement ? ` – ${end.complement}` : ''} · {end.district} · {end.city}/{end.state} · CEP {end.zip_code}</span></li>}
          {p.notes && <li><b>Observações</b><span>{p.notes}</span></li>}
        </ul>

        <h2 className="conta-tit">Itens</h2>
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
        <p className="conta-total">
          Subtotal {reais(p.subtotal_cents)} · Entrega {reais(p.delivery_fee_cents)} · Desconto −{reais(p.discount_cents)}<br />
          <b>Total {reais(p.total_cents)}{p.has_price_pending ? ' + itens a confirmar' : ''}</b>
        </p>

        <h2 className="conta-tit">Status e pagamento</h2>
        <form className="form" action={atualizarPedido}>
          <input type="hidden" name="id" value={p.id} />
          <label htmlFor="o-status">Status</label>
          <select id="o-status" name="status" defaultValue={p.status}>
            {STATUS_LISTA.map(s => <option key={s} value={s}>{STATUS[s]}</option>)}
          </select>
          <label htmlFor="o-pg">Forma de pagamento</label>
          <select id="o-pg" name="payment_method" defaultValue={p.payment_method ?? ''}>
            <option value="">Não definida</option>
            {Object.entries(PAGAMENTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <label htmlFor="o-obs">Observações internas / do pedido</label>
          <textarea id="o-obs" name="notes" maxLength={300} defaultValue={p.notes ?? ''} />
          <button className="btn btn-p" type="submit">Salvar</button>
        </form>

        {aberto && (
          <>
            <h2 className="conta-tit">Taxa de entrega e desconto</h2>
            <form className="form" action={definirValores}>
              <input type="hidden" name="id" value={p.id} />
              <label htmlFor="o-taxa">Taxa de entrega (R$)</label>
              <input id="o-taxa" name="fee" inputMode="decimal" defaultValue={doisDec(p.delivery_fee_cents) || '0,00'} />
              <label htmlFor="o-desc">Desconto (R$)</label>
              <input id="o-desc" name="discount" inputMode="decimal" defaultValue={doisDec(p.discount_cents) || '0,00'} />
              <button className="btn btn-o" type="submit">Recalcular total</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
