import Link from 'next/link';
import { PAGAMENTO, PROXIMOS, enderecoTexto, exigirAdmin, hojeSP, type Status } from '@/lib/admin';
import { PONTO, STATUS, reais } from '@/lib/conta';
import { moverPedido } from '@/app/admin/(painel)/actions';
import Confirmar from '@/components/Confirmar';
import BotaoEnviar from '@/components/BotaoEnviar';
import AlertaPedidos from '@/components/AlertaPedidos';

export const metadata = { title: 'Loja' };

const COLUNAS: { t: string; s: Status[] }[] = [
  { t: 'Novo', s: ['pending', 'confirmed'] },
  { t: 'Em preparo', s: ['preparing'] },
  { t: 'Pronto', s: ['ready'] },
  { t: 'Saiu para entrega', s: ['out_for_delivery'] },
  { t: 'Entregue / Cancelado', s: ['delivered', 'cancelled'] },
];
// rótulo do botão que avança o pedido
const ACAO: Partial<Record<Status, string>> = { confirmed: 'Confirmar', preparing: 'Começar preparo', ready: 'Pronto', out_for_delivery: 'Saiu para entrega', delivered: 'Entregue' };
const MSG: Record<string, string> = { fluxo: 'Esse pedido já mudou de etapa (outro aparelho?). O quadro foi atualizado.', invalido: 'Ação inválida.' };

const CAMPOS = 'id, order_number, created_at, customer_name, customer_phone, order_type, status, notes, delivery_address, payment_method, total_cents, has_price_pending, order_items(id, quantity, product_name, variant_label, doneness, notes, order_item_extras(name, quantity))';
const hora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const minutos = (d: string) => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));

export default async function Loja({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { supabase } = await exigirAdmin();
  // abertos (de qualquer dia) + encerrados de hoje
  const [{ data: abertos }, { data: fechados }] = await Promise.all([
    supabase.from('orders').select(CAMPOS).in('status', ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']).order('created_at').limit(150),
    supabase.from('orders').select(CAMPOS).in('status', ['delivered', 'cancelled']).gte('created_at', `${hojeSP()}T00:00:00-03:00`).order('created_at', { ascending: false }).limit(40),
  ]);
  const todos = [...(abertos ?? []), ...(fechados ?? [])];
  const novos = (abertos ?? []).filter(p => p.status === 'pending').map(p => ({ id: p.id, n: p.order_number }));

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1>Pedidos da <em>loja</em></h1>
      </header>
      <div className="loja">
        <AlertaPedidos novos={novos} />
        {erro && MSG[erro] && <p className="nota wrap" role="alert">{MSG[erro]}</p>}
        <div className="loja-quadro">
          {COLUNAS.map(col => {
            const lista = todos.filter(p => col.s.includes(p.status));
            return (
              <section key={col.t} className="loja-col" aria-label={`${col.t}: ${lista.length}`}>
                <h2>{col.t} <span>{lista.length}</span></h2>
                {lista.length === 0 && <p className="nota">Nada aqui.</p>}
                {lista.map(p => {
                  const entrega = p.order_type === 'delivery';
                  const proximos = PROXIMOS[p.status].filter(s => s !== 'cancelled' && (s !== 'out_for_delivery' || entrega) && !(p.status === 'pending' && s === 'preparing'));
                  return (
                    <article key={p.id} className={`ped ped-${p.status}`}>
                      <header className="ped-cab">
                        <b>#{p.order_number}</b>
                        <span>{hora(p.created_at)}{p.status !== 'delivered' && p.status !== 'cancelled' ? ` · há ${minutos(p.created_at)} min` : ''}</span>
                        <span className={`ped-tipo ${entrega ? 'ent' : 'ret'}`}>{entrega ? 'Entrega' : 'Retirada'}</span>
                      </header>
                      {(p.status === 'confirmed' || p.status === 'cancelled' || p.status === 'delivered') && <p className="ped-st">{STATUS[p.status]}</p>}
                      <p className="ped-cli">{p.customer_name}{p.customer_phone ? ` · ${p.customer_phone}` : ''}</p>
                      <ul className="ped-itens">
                        {p.order_items.map(i => (
                          <li key={i.id}>
                            <b>{i.quantity}×</b> {i.product_name}{i.variant_label ? ` (${i.variant_label})` : ''}
                            {(i.doneness || i.order_item_extras.length > 0) && <small>{[i.doneness && PONTO[i.doneness], ...i.order_item_extras.map(x => `+${x.quantity}× ${x.name}`)].filter(Boolean).join(' · ')}</small>}
                            {i.notes && <mark>{i.notes}</mark>}
                          </li>
                        ))}
                      </ul>
                      {p.notes && <p className="ped-obs"><b>Obs.:</b> {p.notes}</p>}
                      {entrega && <p className="ped-end">{enderecoTexto(p.delivery_address) || 'Endereço não informado'}</p>}
                      <p className="ped-total"><span>{p.payment_method ? PAGAMENTO[p.payment_method] ?? p.payment_method : 'Pagamento a definir'}</span><b>{reais(p.total_cents)}{p.has_price_pending ? ' +' : ''}</b></p>
                      <div className="ped-acoes">
                        {proximos.map(s => (
                          <form key={s} action={moverPedido}>
                            <input type="hidden" name="id" value={p.id} /><input type="hidden" name="para" value={s} />
                            <BotaoEnviar pendente="…" className="btn btn-p">{ACAO[s]}</BotaoEnviar>
                          </form>
                        ))}
                        <a className="btn btn-o" href={`/admin/imprimir/${p.id}`} target="_blank" rel="noopener">Imprimir</a>
                        <Link className="ped-link" href={`/admin/pedidos/${p.id}`}>Detalhes</Link>
                        {PROXIMOS[p.status].includes('cancelled') && (
                          <Confirmar action={moverPedido} mensagem={`Cancelar o pedido #${p.order_number}?`} detalhe="O cliente vê o pedido como cancelado e ele sai do faturamento." rotulo="Cancelar pedido">
                            <input type="hidden" name="id" value={p.id} /><input type="hidden" name="para" value="cancelled" />
                            <button type="submit" className="ped-link ped-cancelar">Cancelar</button>
                          </Confirmar>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
