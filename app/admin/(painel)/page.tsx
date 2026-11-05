import Link from 'next/link';
import { exigirAdmin, hojeSP } from '@/lib/admin';
import { STATUS, data, reais } from '@/lib/conta';

export default async function Painel() {
  const { supabase } = await exigirAdmin();
  const hoje = hojeSP();
  // Números do dia vêm da view sales_summary (mesma regra dos relatórios); pendentes é só uma contagem de pedidos.
  const [{ data: dia }, { count: pendentes }, { data: fila }] = await Promise.all([
    supabase.from('sales_summary').select('total_orders, cancelled_orders, revenue_cents').eq('sale_date', hoje).maybeSingle(),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('orders').select('id, order_number, customer_name, status, total_cents, created_at').eq('status', 'pending').order('created_at').limit(10),
  ]);

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1>Hoje no <em>MDogão</em></h1>
      </header>
      <div className="wrap adm-caixa">
        <div className="adm-kpis">
          <div><span>Pedidos do dia</span><b>{dia?.total_orders ?? 0}</b></div>
          <div><span>Faturamento do dia</span><b>{reais(dia?.revenue_cents ?? 0)}</b></div>
          <div><span>Pedidos pendentes</span><b>{pendentes ?? 0}</b></div>
        </div>
        <p className="nota">Faturamento sem pedidos cancelados ({dia?.cancelled_orders ?? 0} cancelado(s) hoje). Itens "a confirmar" entram com R$ 0,00 até o preço ser combinado.</p>

        <h2 className="conta-tit">Pendentes (mais antigos primeiro)</h2>
        {fila?.length ? (
          <ul className="canais">
            {fila.map(p => (
              <li key={p.id}>
                <Link href={`/admin/pedidos/${p.id}`}><b>#{p.order_number} · {p.customer_name}</b></Link>
                <span>{data(p.created_at)} · {STATUS[p.status]} · {reais(p.total_cents)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="nota">Nenhum pedido pendente.</p>}
      </div>
    </main>
  );
}
