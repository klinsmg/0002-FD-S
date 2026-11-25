import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import LimparCarrinho from '@/components/LimparCarrinho';
import { usuarioAtual } from '@/lib/supabase/server';
import AoVivo from '@/components/AoVivo';
import AvisoEtapa from '@/components/AvisoEtapa';
import MapaRastreio from '@/components/MapaRastreio';
import ConviteAvaliacao from '@/components/ConviteAvaliacao';
import { avaliarNoGoogle } from '@/lib/info';
import { PONTO, STATUS, TIPO, data, reais } from '@/lib/conta';

export const metadata = { title: 'Seu pedido', robots: { index: false, follow: false } };
const EVENTO: Record<string, string> = {
  PEDIDO_CRIADO: 'Pedido recebido', PEDIDO_CONFIRMADO: 'Pedido confirmado', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto', PRONTO_PARA_RETIRADA: 'Pronto para retirada',
  SAIU_PARA_ENTREGA: 'Saiu para entrega', EM_ROTA: 'A caminho', CHEGANDO: 'Chegando', CHEGOU_NO_LOCAL: 'O entregador chegou',
  ENTREGUE: 'Entregue', RETIRADO: 'Retirado', CANCELADO: 'Cancelado', FALHA_NA_ENTREGA: 'A entrega não foi concluída; o pedido voltou para a loja',
  ENTREGA_RECUSADA: 'Trocando de entregador',
};
const hora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Só o DONO vê o pedido: sem sessão vai ao login; com sessão, a consulta filtra por user_id (e o RLS também).
// Pedido de outra pessoa (ou inexistente) cai em 404 igual, sem revelar se existe.
export default async function Pedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, user } = await usuarioAtual();
  if (!user) redirect('/login');

  const { data: p } = await supabase
    .from('orders')
    .select('id, order_number, order_type, status, customer_name, notes, delivery_address, subtotal_cents, delivery_fee_cents, discount_cents, total_cents, has_price_pending, created_at, order_items(id, product_name, variant_label, quantity, doneness, notes, total_price_cents, price_pending, order_item_extras(name, quantity))')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!p) notFound();

  const entrega = p.order_type === 'delivery' && (p.status === 'out_for_delivery' || p.status === 'delivered');
  const [{ data: rastreio }, { data: eventos }] = await Promise.all([
    entrega ? supabase.rpc('order_tracking', { p_order_id: p.id }) : Promise.resolve({ data: null }),
    supabase.from('order_events').select('id, type, created_at').eq('order_id', p.id).order('created_at'),
  ]);
  const r = rastreio?.[0];
  const end = p.delivery_address as Record<string, string> | null;
  // andamento: Recebido → Em preparo → Pronto → (Saiu para entrega) → Entregue/Retirado
  const passos = p.order_type === 'delivery' ? ['Recebido', 'Em preparo', 'Pronto', 'Saiu para entrega', 'Entregue'] : ['Recebido', 'Em preparo', 'Pronto', 'Retirado'];
  const ETAPA: Record<string, number> = { pending: 0, confirmed: 0, preparing: 1, ready: 2, out_for_delivery: 3, delivered: passos.length - 1 };
  const etapa = ETAPA[p.status] ?? -1;
  const encerrado = p.status === 'delivered' || p.status === 'cancelled';
  return (
    <main>
      <LimparCarrinho />
      {p.status === 'delivered' && <ConviteAvaliacao google={avaliarNoGoogle} />}
      <header className="pg-cab wrap">
        <p className="script">pedido recebido</p>
        <h1>Pedido <em>#{p.order_number}</em></h1>
        <p>{data(p.created_at)} · {TIPO[p.order_type] ?? p.order_type} · {STATUS[p.status] ?? p.status}</p>
      </header>
      <div className="wrap conta-caixa">
        {p.status === 'cancelled' ? (
          <p className="nota" role="status"><span className="st st-cancelled">Cancelado</span> Este pedido foi cancelado. Dúvidas? <Link href="/contato">Fale com a loja</Link>.</p>
        ) : (
          <ol className="trilha" style={{ '--n': passos.length } as React.CSSProperties} aria-label="Andamento do pedido">
            {passos.map((t, i) => <li key={t} className={i <= etapa ? 'feito' : undefined} aria-current={i === etapa ? 'step' : undefined}>{t}</li>)}
          </ol>
        )}
        {r && p.status === 'out_for_delivery' && (
          <MapaRastreio pedido={p.id} inicial={{ status: r.status, lat: r.lat, lng: r.lng, destLat: r.dest_lat, destLng: r.dest_lng, eta: r.eta_minutes, km: r.distance_km, rota: r.route_polyline, atualizadoEm: r.updated_at, lojaLat: r.restaurant_lat, lojaLng: r.restaurant_lng, provedor: r.route_provider, etaEm: r.eta_updated_at, velocidade: r.speed_kmh }} />
        )}
        {!!eventos?.length && (
          <details className="eventos" open={p.status === 'out_for_delivery'}>
            <summary>Linha do tempo</summary>
            <ol>{eventos.filter(e => EVENTO[e.type]).map(e => <li key={e.id}><time dateTime={e.created_at}>{hora(e.created_at)}</time> {EVENTO[e.type]}</li>)}</ol>
          </details>
        )}
        <AvisoEtapa etapa={STATUS[p.status] ?? p.status} />
        {!encerrado && <p className="nota"><AoVivo topico={`pedido:${p.id}`} /> Cada mudança no pedido aparece aqui na hora, sem recarregar.</p>}
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

        {p.status === 'pending' && <p className="nota">A loja já recebeu o seu pedido e vai confirmar por aqui{p.order_type === 'delivery' ? ', junto com a taxa de entrega' : ''}. A forma de pagamento é combinada com a loja.</p>}
        <p className="nota"><Link href="/conta/pedidos">Ver todos os meus pedidos</Link></p>
      </div>
    </main>
  );
}
