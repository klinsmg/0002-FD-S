import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/lib/supabase/server';
import { STATUS, TIPO, data, reais } from '@/lib/conta';

export const metadata = { title: 'Meus pedidos' };
const POR_PAGINA = 15;

// Histórico: lista leve (sem os itens completos), 15 por página; o detalhe de cada pedido abre em /pedido/[id].
export default async function Pedidos({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { pagina } = await searchParams;
  const pg = Math.min(Math.max(1, Number.parseInt(pagina ?? '1', 10) || 1), 500);
  const { supabase, user } = await usuarioAtual();
  if (!user) redirect('/login');
  // Filtra pelo dono: o RLS deixa o ADMIN ler todos os pedidos, e aqui é a área pessoal.
  const { data: todos } = await supabase
    .from('orders')
    .select('id, order_number, order_type, status, total_cents, has_price_pending, created_at, order_items(quantity)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range((pg - 1) * POR_PAGINA, pg * POR_PAGINA); // 1 a mais: diz se há próxima página
  const pedidos = todos?.slice(0, POR_PAGINA) ?? [];
  const temMais = (todos?.length ?? 0) > POR_PAGINA;

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">sua conta</p>
        <h1>Meus <em>pedidos</em></h1>
      </header>
      <div className="wrap conta-caixa">
        {pedidos.length ? (
          <ul className="ped-lista">
            {pedidos.map(p => {
              const qtd = p.order_items.reduce((n, i) => n + i.quantity, 0);
              return (
                <li key={p.id}>
                  <Link href={`/pedido/${p.id}`}>
                    <b>Pedido #{p.order_number}</b>
                    <span className="val">{reais(p.total_cents)}{p.has_price_pending ? ' +' : ''}</span>
                    <small>{data(p.created_at)} · {TIPO[p.order_type] ?? p.order_type} · {qtd} {qtd === 1 ? 'item' : 'itens'} · <span className={`st st-${p.status}`}>{STATUS[p.status] ?? p.status}</span></small>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="nota">{pg > 1 ? 'Não há mais pedidos.' : <>Você ainda não fez pedidos. <Link href="/cardapio">Ver o cardápio</Link></>}</p>
        )}
        {(pg > 1 || temMais) && (
          <nav className="adm-paginas" aria-label="Páginas">
            {pg > 1 && <Link href={`/conta/pedidos?pagina=${pg - 1}`}>← Mais novos</Link>}
            <span>Página {pg}</span>
            {temMais && <Link href={`/conta/pedidos?pagina=${pg + 1}`}>Mais antigos →</Link>}
          </nav>
        )}
        <p className="nota">“+” = há itens com valor a confirmar.</p>
      </div>
    </main>
  );
}
