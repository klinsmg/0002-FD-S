import Link from 'next/link';
import { exigirAdmin, hojeSP } from '@/lib/admin';
import { STATUS, data, reais } from '@/lib/conta';

// Dashboard do dono, em Z: (1) quatro números do dia e do mês, (2) mais vendidos e ticket médio do período escolhido,
// (3) faturamento dos últimos 7 dias e últimos pedidos. Números vêm da view sales_summary (cancelados fora).

type Periodo = 'hoje' | '7d' | 'mes';
const FILTROS: [Periodo, string][] = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Mês']];
const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// datas como 'AAAA-MM-DD' no fuso de São Paulo; conta em UTC para não sofrer com horário de verão
const soma = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const diaSP = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
const diaSemana = (d: string) => DIA_SEM[new Date(`${d}T12:00:00Z`).getUTCDay()];

function janelas(p: Periodo, hoje: string) {
  if (p === 'hoje') return { ini: hoje, fim: hoje, pIni: soma(hoje, -1), pFim: soma(hoje, -1), vs: 'vs. ontem', nome: 'hoje' };
  if (p === '7d') return { ini: soma(hoje, -6), fim: hoje, pIni: soma(hoje, -13), pFim: soma(hoje, -7), vs: 'vs. 7 dias anteriores', nome: 'nos últimos 7 dias' };
  return { ...mesAteHoje(hoje), vs: 'vs. mesmo período do mês passado', nome: 'neste mês' };
}
// mês até hoje, comparado com o mês anterior até o mesmo dia (dia 31 vira o último dia do mês anterior)
function mesAteHoje(hoje: string) {
  const [a, m, d] = hoje.split('-').map(Number);
  const ant = new Date(Date.UTC(a, m - 2, 1));
  const ultimoAnt = new Date(Date.UTC(a, m - 1, 0)).getUTCDate();
  const pIni = ant.toISOString().slice(0, 10);
  return { ini: `${hoje.slice(0, 8)}01`, fim: hoje, pIni, pFim: `${pIni.slice(0, 8)}${String(Math.min(d, ultimoAnt)).padStart(2, '0')}` };
}

function Delta({ atual, antes, vs }: { atual: number; antes: number; vs: string }) {
  if (!antes) return <small className="dash-delta">{atual ? `novo · ${vs}` : `sem movimento · ${vs}`}</small>;
  const pct = Math.round(((atual - antes) / antes) * 100);
  const cls = pct > 0 ? 'sobe' : pct < 0 ? 'desce' : '';
  return <small className={`dash-delta ${cls}`}><b aria-hidden="true">{pct > 0 ? '↑' : pct < 0 ? '↓' : '→'}</b> {Math.abs(pct)}% {vs}</small>;
}

export default async function Painel({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p: pRaw } = await searchParams;
  const p: Periodo = pRaw === '7d' || pRaw === 'mes' ? pRaw : 'hoje';
  const { supabase } = await exigirAdmin();
  const hoje = hojeSP();
  const ontem = soma(hoje, -1);
  const mes = mesAteHoje(hoje);
  const j = janelas(p, hoje);
  const desde = [mes.pIni, soma(hoje, -13)].sort()[0];

  const [{ data: dias }, { data: itens }, { data: ultimos }, { count: novos }] = await Promise.all([
    supabase.from('sales_summary').select('sale_date, total_orders, revenue_cents').gte('sale_date', desde),
    // ponytail: soma os itens no servidor do site (até 5000 linhas); se o volume crescer, trocar por uma view agregada por dia e produto
    supabase.from('order_items').select('product_name, quantity, orders!inner(created_at, status)')
      .gte('orders.created_at', `${j.pIni}T00:00:00-03:00`).neq('orders.status', 'cancelled').limit(5000),
    supabase.from('orders').select('id, order_number, customer_name, status, total_cents, has_price_pending, created_at').order('created_at', { ascending: false }).limit(8),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  // soma faturamento e pedidos de um intervalo de dias
  const porDia = new Map((dias ?? []).map(d => [d.sale_date!, d]));
  const total = (ini: string, fim: string) => {
    let receita = 0, pedidos = 0;
    for (let d = ini; d <= fim; d = soma(d, 1)) { const x = porDia.get(d); receita += x?.revenue_cents ?? 0; pedidos += x?.total_orders ?? 0; }
    return { receita, pedidos };
  };
  const tHoje = total(hoje, hoje), tOntem = total(ontem, ontem);
  const tMes = total(mes.ini, mes.fim), tMesAnt = total(mes.pIni, mes.pFim);
  const tPer = total(j.ini, j.fim), tPerAnt = total(j.pIni, j.pFim);
  const ticket = tPer.pedidos ? Math.round(tPer.receita / tPer.pedidos) : 0;
  const ticketAnt = tPerAnt.pedidos ? Math.round(tPerAnt.receita / tPerAnt.pedidos) : 0;

  // mais vendidos (unidades) no período e no período anterior
  const un = new Map<string, { agora: number; antes: number }>();
  for (const i of itens ?? []) {
    const d = diaSP(i.orders.created_at);
    const x = un.get(i.product_name) ?? { agora: 0, antes: 0 };
    if (d >= j.ini && d <= j.fim) x.agora += i.quantity; else if (d >= j.pIni && d <= j.pFim) x.antes += i.quantity;
    un.set(i.product_name, x);
  }
  const top = [...un.entries()].filter(([, x]) => x.agora > 0).sort((a, b) => b[1].agora - a[1].agora).slice(0, 3);

  // gráfico: faturamento dos últimos 7 dias
  const semana = Array.from({ length: 7 }, (_, k) => soma(hoje, k - 6)).map(d => ({ d, v: porDia.get(d)?.revenue_cents ?? 0, n: porDia.get(d)?.total_orders ?? 0 }));
  const max = Math.max(...semana.map(x => x.v), 1);
  const iMax = semana.findIndex(x => x.v === max);

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1>Hoje no <em>MDogão</em></h1>
      </header>
      <div className="wrap adm-caixa dash">
        {!!novos && <p className="dash-alerta"><Link href="/admin/loja">{novos} pedido{novos > 1 ? 's' : ''} novo{novos > 1 ? 's' : ''} aguardando na Loja →</Link></p>}

        {/* 1. topo do Z: dia e mês */}
        <section className="dash-kpis" aria-label="Números do dia e do mês">
          <div><span>Faturamento hoje</span><b>{reais(tHoje.receita)}</b><Delta atual={tHoje.receita} antes={tOntem.receita} vs="vs. ontem" /></div>
          <div><span>Faturamento do mês</span><b>{reais(tMes.receita)}</b><Delta atual={tMes.receita} antes={tMesAnt.receita} vs="vs. mês passado" /></div>
          <div><span>Pedidos hoje</span><b>{tHoje.pedidos}</b><Delta atual={tHoje.pedidos} antes={tOntem.pedidos} vs="vs. ontem" /></div>
          <div><span>Pedidos do mês</span><b>{tMes.pedidos}</b><Delta atual={tMes.pedidos} antes={tMesAnt.pedidos} vs="vs. mês passado" /></div>
        </section>

        {/* 2. meio do Z: período escolhido */}
        <nav className="dash-filtro" aria-label="Período">
          {FILTROS.map(([v, t]) => <Link key={v} href={v === 'hoje' ? '/admin' : `/admin?p=${v}`} aria-current={p === v ? 'true' : undefined}>{t}</Link>)}
        </nav>
        <div className="dash-meio">
          <section className="dash-card" aria-labelledby="t-top">
            <h2 id="t-top">Mais vendidos {j.nome}</h2>
            {top.length ? (
              <ol className="dash-top">
                {top.map(([nome, x], k) => (
                  <li key={nome}><i aria-hidden="true">{k + 1}</i><span>{nome}</span><b>{x.agora} un.</b><Delta atual={x.agora} antes={x.antes} vs={j.vs} /></li>
                ))}
              </ol>
            ) : <p className="nota">Nenhuma venda {j.nome}.</p>}
          </section>
          <section className="dash-card dash-ticket" aria-labelledby="t-ticket">
            <h2 id="t-ticket">Ticket médio {j.nome}</h2>
            <b>{reais(ticket)}</b>
            <Delta atual={ticket} antes={ticketAnt} vs={j.vs} />
            <p className="nota">{tPer.pedidos} pedido{tPer.pedidos === 1 ? '' : 's'} · {reais(tPer.receita)}</p>
          </section>
        </div>

        {/* 3. base do Z: 7 dias e últimos pedidos */}
        <div className="dash-base">
          <section className="dash-card" aria-labelledby="t-7d">
            <h2 id="t-7d">Faturamento dos últimos 7 dias</h2>
            <div className="dash-graf" role="group" aria-label="Gráfico de barras: faturamento por dia">
              {semana.map((x, k) => (
                <div key={x.d} className={`dash-col${x.d === hoje ? ' hoje' : ''}`} tabIndex={0} aria-label={`${diaSemana(x.d)} ${x.d.slice(8, 10)}/${x.d.slice(5, 7)}: ${reais(x.v)}, ${x.n} pedidos`}>
                  <span className="dash-dica" role="tooltip">{diaSemana(x.d)} {x.d.slice(8, 10)}/{x.d.slice(5, 7)}<br /><b>{reais(x.v)}</b> · {x.n} ped.</span>
                  {(k === iMax || x.d === hoje) && x.v > 0 && <span className="dash-rot">{reais(x.v).replace(/,\d\d$/, '')}</span>}
                  <span className="dash-barra" style={{ height: `${Math.max((x.v / max) * 100, x.v ? 2 : 0)}%` }} />
                  <span className="dash-dia">{x.d === hoje ? 'hoje' : diaSemana(x.d)}</span>
                </div>
              ))}
            </div>
            <details className="dash-tabela">
              <summary>Ver em tabela</summary>
              <table className="adm-tab">
                <thead><tr><th>Dia</th><th>Pedidos</th><th>Faturamento</th></tr></thead>
                <tbody>{semana.map(x => <tr key={x.d}><td>{diaSemana(x.d)} {x.d.slice(8, 10)}/{x.d.slice(5, 7)}</td><td>{x.n}</td><td>{reais(x.v)}</td></tr>)}</tbody>
              </table>
            </details>
          </section>
          <section className="dash-card" aria-labelledby="t-ult">
            <h2 id="t-ult">Últimos pedidos</h2>
            {ultimos?.length ? (
              <ul className="dash-ult">
                {ultimos.map(o => (
                  <li key={o.id}>
                    <Link href={`/admin/pedidos/${o.id}`}><b>#{o.order_number}</b> {o.customer_name}</Link>
                    <span>{reais(o.total_cents)}{o.has_price_pending ? ' +' : ''}</span>
                    <small>{data(o.created_at)} · <span className={`st st-${o.status}`}>{STATUS[o.status]}</span></small>
                  </li>
                ))}
              </ul>
            ) : <p className="nota">Nenhum pedido ainda.</p>}
            <p className="nota"><Link href="/admin/pedidos">Ver todos os pedidos</Link></p>
          </section>
        </div>
        <p className="nota">Faturamento sem pedidos cancelados. Itens “a confirmar” entram com R$ 0,00 até o preço ser combinado.</p>
      </div>
    </main>
  );
}
