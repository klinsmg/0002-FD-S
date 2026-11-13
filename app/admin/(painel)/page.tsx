import Link from 'next/link';
import { exigirAdmin, hojeSP, type Status } from '@/lib/admin';
import { STATUS, reais } from '@/lib/conta';

// Dashboard do dono (referência: painel de acompanhamento em uma tela). No desktop cabe sem rolagem:
// título + filtro → aviso do momento → 4 números (dia e mês) → [faturamento 7 dias | mais vendidos] → [situação | ticket | últimos].
// Números da view sales_summary (cancelados fora). O filtro Hoje / 7 dias / Mês vale para mais vendidos, situação e ticket.

type Periodo = 'hoje' | '7d' | 'mes';
const FILTROS: [Periodo, string][] = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Mês']];
const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
// situação dos pedidos: cores na ordem fixa da paleta categórica validada (modo escuro), sempre com rótulo e número
const SITUACAO: { t: string; s: Status[]; cor: string }[] = [
  { t: 'Novos', s: ['pending', 'confirmed'], cor: '#3987e5' },
  { t: 'Em preparo', s: ['preparing'], cor: '#d95926' },
  { t: 'Prontos/saiu', s: ['ready', 'out_for_delivery'], cor: '#199e70' },
  { t: 'Entregues', s: ['delivered'], cor: '#c98500' },
  { t: 'Cancelados', s: ['cancelled'], cor: '#d55181' },
];

// datas como 'AAAA-MM-DD' no fuso de São Paulo; conta em UTC para não sofrer com horário de verão
const soma = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const diaSP = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
const diaSemana = (d: string) => DIA_SEM[new Date(`${d}T12:00:00Z`).getUTCDay()];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const curto = (c: number) => reais(c).replace(/,00$/, '');

function janelas(p: Periodo, hoje: string) {
  if (p === 'hoje') return { ini: hoje, fim: hoje, pIni: soma(hoje, -1), pFim: soma(hoje, -1), vs: 'vs. ontem', nome: 'hoje' };
  if (p === '7d') return { ini: soma(hoje, -6), fim: hoje, pIni: soma(hoje, -13), pFim: soma(hoje, -7), vs: 'vs. 7 dias anteriores', nome: '7 dias' };
  return { ...mesAteHoje(hoje), vs: 'vs. mês passado', nome: 'no mês' };
}
// mês até hoje, comparado com o mês anterior até o mesmo dia (dia 31 vira o último dia do mês anterior)
function mesAteHoje(hoje: string) {
  const [a, m, d] = hoje.split('-').map(Number);
  const ant = new Date(Date.UTC(a, m - 2, 1));
  const ultimoAnt = new Date(Date.UTC(a, m - 1, 0)).getUTCDate();
  const pIni = ant.toISOString().slice(0, 10);
  return { ini: `${hoje.slice(0, 8)}01`, fim: hoje, pIni, pFim: `${pIni.slice(0, 8)}${String(Math.min(d, ultimoAnt)).padStart(2, '0')}` };
}
const pct = (atual: number, antes: number) => (antes ? Math.round(((atual - antes) / antes) * 100) : null);

// compacto: só seta e % (o "vs." fica no título do bloco)
function Delta({ atual, antes, vs, compacto = false }: { atual: number; antes: number; vs: string; compacto?: boolean }) {
  const v = pct(atual, antes);
  if (v === null) return <small className="dash-delta">{compacto ? (atual ? 'novo' : '–') : atual ? `novo · ${vs}` : `sem movimento · ${vs}`}</small>;
  const cls = v > 0 ? 'sobe' : v < 0 ? 'desce' : '';
  return <small className={`dash-delta ${cls}`}><b aria-hidden="true">{v > 0 ? '↑' : v < 0 ? '↓' : '→'}</b> {Math.abs(v)}%{compacto ? <span className="sr"> {vs}</span> : ` ${vs}`}</small>;
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
  const agora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

  const [{ data: dias }, { data: itens }, { data: doPeriodo }, { data: ultimos }] = await Promise.all([
    supabase.from('sales_summary').select('sale_date, total_orders, revenue_cents').gte('sale_date', desde),
    // ponytail: soma os itens no servidor do site (até 5000 linhas); se o volume crescer, trocar por uma view agregada por dia e produto
    supabase.from('order_items').select('product_name, quantity, orders!inner(created_at, status)')
      .gte('orders.created_at', `${j.pIni}T00:00:00-03:00`).neq('orders.status', 'cancelled').limit(5000),
    supabase.from('orders').select('status').gte('created_at', `${j.ini}T00:00:00-03:00`).limit(5000),
    supabase.from('orders').select('id, order_number, customer_name, status, total_cents, created_at').order('created_at', { ascending: false }).limit(4),
  ]);

  // faturamento e pedidos de um intervalo de dias
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

  // mais vendidos (unidades) no período e no anterior
  const un = new Map<string, { agora: number; antes: number }>();
  for (const i of itens ?? []) {
    const d = diaSP(i.orders.created_at);
    const x = un.get(i.product_name) ?? { agora: 0, antes: 0 };
    if (d >= j.ini && d <= j.fim) x.agora += i.quantity; else if (d >= j.pIni && d <= j.pFim) x.antes += i.quantity;
    un.set(i.product_name, x);
  }
  const top = [...un.entries()].filter(([, x]) => x.agora > 0).sort((a, b) => b[1].agora - a[1].agora).slice(0, 3);
  const topMax = Math.max(...top.map(([, x]) => x.agora), 1);

  // situação dos pedidos do período
  const sit = SITUACAO.map(g => ({ ...g, n: (doPeriodo ?? []).filter(o => g.s.includes(o.status)).length }));
  const sitTotal = sit.reduce((a, g) => a + g.n, 0);
  const novos = sit[0].n;

  // gráfico: faturamento dos últimos 7 dias
  const semana = Array.from({ length: 7 }, (_, k) => soma(hoje, k - 6)).map(d => ({ d, v: porDia.get(d)?.revenue_cents ?? 0, n: porDia.get(d)?.total_orders ?? 0 }));
  const max = Math.max(...semana.map(x => x.v), 1);
  const iMax = semana.findIndex(x => x.v === max);

  // aviso do momento (faixa abaixo do título)
  const vHoje = pct(tHoje.receita, tOntem.receita);
  const aviso = novos > 0 && p === 'hoje'
    ? { cls: 'atencao', txt: `${novos} pedido${novos > 1 ? 's' : ''} novo${novos > 1 ? 's' : ''} aguardando na Loja`, href: '/admin/loja' }
    : vHoje !== null && vHoje > 0 ? { cls: 'bom', txt: `Faturamento de hoje ${vHoje}% acima de ontem (${curto(tHoje.receita)} × ${curto(tOntem.receita)})` }
    : vHoje !== null && vHoje < 0 ? { cls: 'info', txt: `Faturamento de hoje ${Math.abs(vHoje)}% abaixo de ontem até agora (${curto(tHoje.receita)} × ${curto(tOntem.receita)})` }
    : { cls: 'bom', txt: 'Nenhum pedido esperando: a Loja está em dia.' };

  return (
    <main className="dash">
      <header className="dash-tit">
        <div>
          <h1>Painel do <em>MDogão</em></h1>
          <p>Atualizado às {agora} · cancelados fora do faturamento</p>
        </div>
        <nav className="dash-filtro" aria-label="Período">
          {FILTROS.map(([v, t]) => <Link key={v} href={v === 'hoje' ? '/admin' : `/admin?p=${v}`} aria-current={p === v ? 'true' : undefined}>{t}</Link>)}
        </nav>
      </header>

      <p className={`dash-aviso ${aviso.cls}`} role="status">
        <i aria-hidden="true">{aviso.cls === 'atencao' ? '!' : aviso.cls === 'bom' ? '✓' : 'i'}</i>
        {aviso.href ? <Link href={aviso.href}>{aviso.txt} →</Link> : aviso.txt}
      </p>

      <section className="dash-kpis" aria-label="Números do dia e do mês">
        <div className="destaque"><b>{curto(tHoje.receita)}</b><span>Faturamento hoje</span><Delta atual={tHoje.receita} antes={tOntem.receita} vs="vs. ontem" /></div>
        <div><b>{curto(tMes.receita)}</b><span>Faturamento do mês</span><Delta atual={tMes.receita} antes={tMesAnt.receita} vs="vs. mês passado" /></div>
        <div><b>{tHoje.pedidos}</b><span>Pedidos hoje</span><Delta atual={tHoje.pedidos} antes={tOntem.pedidos} vs="vs. ontem" /></div>
        <div><b>{tMes.pedidos}</b><span>Pedidos do mês</span><Delta atual={tMes.pedidos} antes={tMesAnt.pedidos} vs="vs. mês passado" /></div>
      </section>

      <div className="dash-meio">
        <section className="dash-card" aria-labelledby="t-7d">
          <h2 id="t-7d">Faturamento dos últimos 7 dias</h2>
          <div className="dash-graf" role="group" aria-label="Gráfico de barras: faturamento por dia">
            {semana.map((x, k) => (
              <div key={x.d} className={`dash-col${x.d === hoje ? ' hoje' : ''}`} tabIndex={0} aria-label={`${diaSemana(x.d)} ${ddmm(x.d)}: ${reais(x.v)}, ${x.n} pedidos`}>
                <span className="dash-dica" role="tooltip">{diaSemana(x.d)} {ddmm(x.d)}<br /><b>{reais(x.v)}</b> · {x.n} ped.</span>
                {/* o rótulo fica dentro da barra (acima dela, posicionado): assim não rouba altura e a proporção fica exata */}
                <span className="dash-barra" style={{ height: `${Math.max((x.v / max) * 100, x.v ? 2 : 0)}%` }}>
                  {(k === iMax || x.d === hoje) && x.v > 0 && <span className="dash-rot">{curto(x.v)}</span>}
                </span>
                <span className="dash-dia">{x.d === hoje ? 'hoje' : diaSemana(x.d)}</span>
              </div>
            ))}
          </div>
          <table className="sr">
            <caption>Faturamento por dia</caption>
            <thead><tr><th>Dia</th><th>Pedidos</th><th>Faturamento</th></tr></thead>
            <tbody>{semana.map(x => <tr key={x.d}><td>{diaSemana(x.d)} {ddmm(x.d)}</td><td>{x.n}</td><td>{reais(x.v)}</td></tr>)}</tbody>
          </table>
        </section>

        <section className="dash-card" aria-labelledby="t-top">
          <h2 id="t-top">Mais vendidos · {j.nome} <small className="dash-vs">{j.vs}</small></h2>
          {top.length ? (
            <ol className="dash-top">
              {top.map(([nome, x]) => (
                <li key={nome}>
                  <span className="nome">{nome}</span>
                  <span className="trilho"><span style={{ width: `${(x.agora / topMax) * 100}%` }} /></span>
                  <b>{x.agora} un.</b>
                  <Delta atual={x.agora} antes={x.antes} vs={j.vs} compacto />
                </li>
              ))}
            </ol>
          ) : <p className="nota">Nenhuma venda no período.</p>}
        </section>
      </div>

      <div className="dash-base">
        <section className="dash-card" aria-labelledby="t-sit">
          <h2 id="t-sit">Situação dos pedidos · {j.nome}</h2>
          {sitTotal ? (
            <>
              <div className="dash-seg" aria-hidden="true">
                {sit.filter(g => g.n).map(g => (
                  <span key={g.t} style={{ flexGrow: g.n, background: g.cor }}>{g.n / sitTotal >= 0.12 ? `${Math.round((g.n / sitTotal) * 100)}%` : ''}</span>
                ))}
              </div>
              <ul className="dash-leg">
                {sit.map(g => (
                  <li key={g.t}><i style={{ background: g.cor }} aria-hidden="true" /><b>{g.t}</b> {Math.round((g.n / sitTotal) * 100)}% <span>({g.n})</span></li>
                ))}
              </ul>
            </>
          ) : <p className="nota">Sem pedidos no período.</p>}
        </section>

        <section className="dash-card dash-ticket" aria-labelledby="t-ticket">
          <b>{curto(ticket)}</b>
          <h2 id="t-ticket">Ticket médio · {j.nome}</h2>
          <Delta atual={ticket} antes={ticketAnt} vs={j.vs} />
          <p className="nota">{tPer.pedidos} pedido{tPer.pedidos === 1 ? '' : 's'} · {curto(tPer.receita)}</p>
        </section>

        <section className="dash-card" aria-labelledby="t-ult">
          <h2 id="t-ult">Últimos pedidos <Link href="/admin/pedidos">ver todos</Link></h2>
          {ultimos?.length ? (
            <ul className="dash-ult">
              {ultimos.map(o => (
                <li key={o.id}>
                  <Link href={`/admin/pedidos/${o.id}`}><b>#{o.order_number}</b> {o.customer_name}</Link>
                  <span className={`st st-${o.status}`}>{STATUS[o.status]}</span>
                  <span className="val">{curto(o.total_cents)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="nota">Nenhum pedido ainda.</p>}
        </section>
      </div>
    </main>
  );
}
