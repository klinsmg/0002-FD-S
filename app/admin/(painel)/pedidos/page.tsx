import Link from 'next/link';
import { DATA, STATUS_LISTA, exigirAdmin, type Status } from '@/lib/admin';
import { STATUS, TIPO, data, reais } from '@/lib/conta';

export const metadata = { title: 'Pedidos' };
const POR_PAGINA = 30;

export default async function Pedidos({ searchParams }: { searchParams: Promise<{ status?: string; de?: string; ate?: string; pagina?: string }> }) {
  const { status, de, ate, pagina } = await searchParams;
  const pg = Math.min(Math.max(1, Number.parseInt(pagina ?? '1', 10) || 1), 1000);
  const { supabase } = await exigirAdmin();

  // filtros validados; datas no fuso de São Paulo (-03:00)
  let q = supabase.from('orders').select('id, order_number, customer_name, order_type, status, total_cents, has_price_pending, created_at')
    .order('created_at', { ascending: false }).range((pg - 1) * POR_PAGINA, pg * POR_PAGINA); // 1 a mais: diz se há próxima página
  if (status && STATUS_LISTA.includes(status as Status)) q = q.eq('status', status as Status);
  if (de && DATA.test(de)) q = q.gte('created_at', `${de}T00:00:00-03:00`);
  if (ate && DATA.test(ate)) q = q.lte('created_at', `${ate}T23:59:59.999-03:00`);
  const { data: todos } = await q;
  const pedidos = todos?.slice(0, POR_PAGINA);
  const temMais = (todos?.length ?? 0) > POR_PAGINA;
  const link = (n: number) => `/admin/pedidos?${new URLSearchParams({ ...(status && { status }), ...(de && { de }), ...(ate && { ate }), pagina: String(n) })}`;

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1><em>Pedidos</em></h1>
      </header>
      <div className="wrap adm-caixa">
        <form className="adm-filtro" method="get">
          <label>Status
            <select name="status" defaultValue={status ?? ''}>
              <option value="">Todos</option>
              {STATUS_LISTA.map(s => <option key={s} value={s}>{STATUS[s]}</option>)}
            </select>
          </label>
          <label>De<input type="date" name="de" defaultValue={de && DATA.test(de) ? de : ''} /></label>
          <label>Até<input type="date" name="ate" defaultValue={ate && DATA.test(ate) ? ate : ''} /></label>
          <button className="btn btn-p" type="submit">Filtrar</button>
          <Link className="nota" href="/admin/pedidos">Limpar</Link>
        </form>

        {pedidos?.length ? (
          <div className="adm-rolagem">
            <table className="adm-tab">
              <thead><tr><th>#</th><th>Data</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {pedidos.map(p => (
                  <tr key={p.id}>
                    <td><Link href={`/admin/pedidos/${p.id}`}>#{p.order_number}</Link></td>
                    <td>{data(p.created_at)}</td>
                    <td>{p.customer_name}</td>
                    <td>{TIPO[p.order_type] ?? p.order_type}</td>
                    <td>{STATUS[p.status]}</td>
                    <td>{reais(p.total_cents)}{p.has_price_pending ? ' +' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="nota">Nenhum pedido neste filtro.</p>}
        <nav className="adm-paginas" aria-label="Páginas">
          {pg > 1 && <Link href={link(pg - 1)}>← Mais novos</Link>}
          <span>Página {pg}</span>
          {temMais && <Link href={link(pg + 1)}>Mais antigos →</Link>}
        </nav>
        <p className="nota">{POR_PAGINA} pedidos por página, do mais novo ao mais antigo. “+” = há itens a confirmar.</p>
      </div>
    </main>
  );
}
