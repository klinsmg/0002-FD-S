import { diaBr, exigirAdmin, mesBr } from '@/lib/admin';
import { reais } from '@/lib/conta';

export const metadata = { title: 'Relatórios' };

// Só leitura das views (sales_summary, monthly_sales, best_selling_products): nenhuma conta de relatório é refeita aqui.
export default async function Relatorios() {
  const { supabase } = await exigirAdmin();
  const [{ data: dias }, { data: meses }, { data: top }] = await Promise.all([
    supabase.from('sales_summary').select('*').order('sale_date', { ascending: false }).limit(31),
    supabase.from('monthly_sales').select('*').order('month', { ascending: false }).limit(24),
    supabase.from('best_selling_products').select('*').order('units_sold', { ascending: false }).limit(20),
  ]);

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1><em>Relatórios</em></h1>
        <p>Dias e meses no fuso de São Paulo. Pedidos cancelados não entram no faturamento.</p>
      </header>
      <div className="wrap adm-caixa">
        <h2 className="conta-tit">Vendas por dia (últimos 31) · <a href="/admin/relatorios/export?tipo=diario">CSV</a></h2>
        <div className="adm-rolagem">
          <table className="adm-tab">
            <thead><tr><th>Dia</th><th>Pedidos</th><th>Cancelados</th><th>Faturamento</th><th>Ticket médio</th></tr></thead>
            <tbody>{dias?.map(d => (
              <tr key={d.sale_date}><td>{diaBr(d.sale_date)}</td><td>{d.total_orders}</td><td>{d.cancelled_orders}</td><td>{reais(d.revenue_cents ?? 0)}</td><td>{reais(d.average_ticket_cents ?? 0)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {!dias?.length && <p className="nota">Sem vendas ainda.</p>}

        <h2 className="conta-tit">Vendas por mês · <a href="/admin/relatorios/export?tipo=mensal">CSV</a></h2>
        <div className="adm-rolagem">
          <table className="adm-tab">
            <thead><tr><th>Mês</th><th>Pedidos</th><th>Faturamento</th></tr></thead>
            <tbody>{meses?.map(m => (
              <tr key={m.month}><td>{mesBr(m.month)}</td><td>{m.total_orders}</td><td>{reais(m.revenue_cents ?? 0)}</td></tr>
            ))}</tbody>
          </table>
        </div>

        <h2 className="conta-tit">Mais vendidos (top 20) · <a href="/admin/relatorios/export?tipo=produtos">CSV</a></h2>
        <div className="adm-rolagem">
          <table className="adm-tab">
            <thead><tr><th>Produto</th><th>Unidades</th><th>Receita</th><th>Pedidos</th></tr></thead>
            <tbody>{top?.map(t => (
              <tr key={t.product_id ?? t.product_name}><td>{t.product_name}</td><td>{t.units_sold}</td><td>{reais(t.revenue_cents ?? 0)}</td><td>{t.orders_count}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="nota">Receita por produto = preço × quantidade, sem extras, taxa de entrega nem desconto.</p>
      </div>
    </main>
  );
}
