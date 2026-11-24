import { exigirAdmin } from '@/lib/admin';
import { info } from '@/lib/info';
import { salvarRestaurante } from '@/app/admin/(painel)/actions';
import BotaoEnviar from '@/components/BotaoEnviar';
import { configMapas } from '@/lib/mapas/config';
import { PRECO_MIL, type Sku } from '@/lib/mapas/servico';

export const metadata = { title: 'Mapas' };
export const dynamic = 'force-dynamic';

const SKU: Record<string, string> = { routes: 'Rotas (Routes API)', map_load: 'Carregamentos de mapa', map_tiles: 'Tiles do mapa (Map Tiles API)' };
const PROV: Record<string, string> = { google: 'Google', osrm: 'OSRM (próprio)', estimativa: 'Estimativa local', proprio: 'Mapa próprio' };
const MSG: Record<string, string> = { restaurante: 'Confira o nome e as coordenadas (as duas juntas, ex.: -23.5367 e -46.9342).', endereco: 'Endereço não encontrado. Inclua rua, número, cidade e estado (ou o CEP) e tente de novo.', falha: 'Não foi possível salvar agora.' };
const dia = (d: string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const pct = (u: number, c: number) => (c > 0 ? Math.round((u / c) * 1000) / 10 : 0);

// serviço do VPS responde? (2 s; só o admin vê; o token vai no cabeçalho, nunca na tela)
async function vivo(url: string, token: string) {
  if (!url) return null;
  try { const r = await fetch(url, { headers: { 'X-Mapas-Token': token }, signal: AbortSignal.timeout(2000), cache: 'no-store' }); return r.ok || r.status === 206; } catch { return false; }
}

// Mapas: saúde da infraestrutura própria, regras do Google por restaurante e consumo da cota grátis.
export default async function Mapas({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const { supabase } = await exigirAdmin();
  const cfg = configMapas();
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: lojas }, { data: uso }, { data: avisos }, { data: chamadas }, osrm, nominatim, tiles] = await Promise.all([
    supabase.from('restaurants').select('id, name, lat, lng, google_maps_enabled, plan, google_maps_percent').order('created_at'),
    supabase.from('google_api_usage').select('sku, period_start, period_end, used_events, free_cap').order('period_start', { ascending: false }).limit(6),
    supabase.from('google_api_alerts').select('sku, level, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('google_api_calls').select('order_id, restaurant_id, courier_id, provider, sku, status, created_at, orders(order_number)').gte('created_at', desde).order('created_at', { ascending: false }).limit(5000),
    vivo(cfg.osrm && `${cfg.osrm}/route/v1/driving/-46.93,-23.53;-46.92,-23.54?overview=false`, cfg.token),
    vivo(cfg.nominatim && `${cfg.nominatim}/status`, cfg.token),
    vivo(cfg.tiles, ''),
  ]);
  const mes = uso?.[0]?.period_start;
  const atual = (uso ?? []).filter(u => u.period_start === mes);
  const lista = chamadas ?? [];
  const google = lista.filter(c => c.provider === 'google');
  const porDia = Object.entries(lista.reduce<Record<string, Record<string, number>>>((a, c) => { const k = c.created_at.slice(0, 10); (a[k] ??= {})[c.provider] = (a[k][c.provider] ?? 0) + 1; return a; }, {})).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14);
  const top = (k: 'order_id' | 'courier_id' | 'restaurant_id') => Object.entries(google.reduce<Record<string, number>>((a, c) => { const v = c[k]; if (v) a[v] = (a[v] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const numPedido = new Map(lista.filter(c => c.order_id).map(c => [c.order_id!, (c.orders as unknown as { order_number: number } | null)?.order_number]));
  const nomeLoja = new Map((lojas ?? []).map(l => [l.id, l.name]));
  const fallbacks = lista.filter(c => c.status.startsWith('fallback:')).length;
  const excedente = (s: Sku, u: number, cap: number) => Math.max(0, u - cap) / 1000 * PRECO_MIL[s];
  const custo = atual.reduce((t, u) => t + excedente(u.sku as Sku, u.used_events, u.free_cap), 0);
  const st = (v: boolean | null) => (v === null ? 'não configurado' : v ? 'no ar' : 'sem resposta');

  return (
    <main>
      <header className="pg-cab wrap"><p className="script">painel</p><h1><em>Mapas</em> e rotas</h1></header>
      <div className="wrap conta-caixa">
        <nav className="conta-ancoras" aria-label="Seções"><a href="#infra">Infraestrutura</a><a href="#loja">Loja</a><a href="#google">Google</a><a href="#uso">Uso</a></nav>
        {ok && <p className="nota" role="status">{ok === 'aprox' ? 'Salvo, mas o ponto é aproximado (a rua não está no mapa do OpenStreetMap; usei o CEP ou a rua mais próxima). Confira no mapa e, se precisar, ajuste as coordenadas à mão.' : 'Salvo.'}</p>}
        {erro && MSG[erro] && <p className="nota" role="alert">{MSG[erro]}</p>}

        <section id="infra" aria-labelledby="t-infra">
          <h2 className="conta-tit" id="t-infra">Infraestrutura própria (VPS)</h2>
          <ul className="aud-lista">
            <li><span>Rotas (OSRM)</span><span>{st(osrm)}</span></li>
            <li><span>Endereços (Nominatim)</span><span>{st(nominatim)}</span></li>
            <li><span>Mapa (PMTiles)</span><span>{st(tiles)}</span></li>
          </ul>
          <p className="nota">Sem o VPS o rastreamento segue funcionando: ETA pela distância, mapa simplificado, e a loja cola as coordenadas no despacho quando o cliente não marcou o pino. Como subir: <code>infra/README.md</code>.</p>
        </section>

        <section id="loja" aria-labelledby="t-loja">
          <h2 className="conta-tit" id="t-loja">Loja no mapa</h2>
          {(lojas ?? []).map(l => (
            <form key={l.id} action={salvarRestaurante} className="form">
              <input type="hidden" name="id" value={l.id} />
              <label htmlFor={`n-${l.id}`}>Nome</label>
              <input id={`n-${l.id}`} name="name" defaultValue={l.name} maxLength={80} required />
              <label htmlFor={`e-${l.id}`}>Endereço da loja</label>
              <input id={`e-${l.id}`} name="endereco" maxLength={200} autoComplete="street-address"
                defaultValue={l.lat == null ? `${info.rua}, ${info.bairro}` : ''}
                placeholder={l.lat == null ? 'Rua, número, bairro, cidade - UF, CEP' : 'Preencha só para mudar o ponto da loja'} />
              <p className="nota">
                {l.lat != null && l.lng != null
                  ? <>Ponto atual: {l.lat.toFixed(5)}, {l.lng.toFixed(5)} · <a href={`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=18/${l.lat}/${l.lng}`} target="_blank" rel="noopener noreferrer">conferir no mapa</a></>
                  : 'Ainda sem ponto: salve com o endereço e o sistema encontra a latitude e a longitude.'}
              </p>
              <details className="ped-coords">
                <summary>Ajustar coordenadas à mão (se o ponto encontrado ficar longe da porta)</summary>
                <label htmlFor={`la-${l.id}`}>Latitude</label>
                <input id={`la-${l.id}`} name="lat" inputMode="decimal" defaultValue={l.lat ?? ''} placeholder="-23.5367" />
                <label htmlFor={`lo-${l.id}`}>Longitude</label>
                <input id={`lo-${l.id}`} name="lng" inputMode="decimal" defaultValue={l.lng ?? ''} placeholder="-46.9342" />
                <p className="nota">Só valem com o campo de endereço vazio.</p>
              </details>
              <p className="nota">O ponto da loja é a origem da rota inicial e o marcador 🌭 no mapa do cliente.</p>
              <label className="conta-check"><input type="checkbox" name="google" defaultChecked={l.google_maps_enabled} /> Usar o Google nesta loja (rota e mapa; só com GOOGLE_MAPS_ENABLED=true)</label>
              <label htmlFor={`pl-${l.id}`}>Plano</label>
              <select id={`pl-${l.id}`} name="plan" defaultValue={l.plan}><option value="basico">Básico</option><option value="premium">Premium</option></select>
              <label htmlFor={`pc-${l.id}`}>Pedidos com Google (%)</label>
              <input id={`pc-${l.id}`} name="percent" type="number" min={0} max={100} step={1} defaultValue={l.google_maps_percent} />
              <BotaoEnviar pendente="Salvando…" className="btn btn-p">Salvar loja</BotaoEnviar>
            </form>
          ))}
        </section>

        <section id="google" aria-labelledby="t-google">
          <h2 className="conta-tit" id="t-google">Google Maps Platform (opcional)</h2>
          <p className="nota">
            {cfg.google.ligado ? 'Ligado no servidor.' : 'Desligado: tudo roda no OSRM e no mapa próprio, com custo zero.'}{' '}
            Rota com Google só em gatilho (início, desvio, perto do destino, pedido do cliente), no máximo a cada {cfg.google.intervaloMs / 60000} min,
            com cache de {cfg.google.cacheMs / 60000} min. Perto de {cfg.google.softPct}% da cota, passa sozinho para o OSRM; no teto, bloqueia até o próximo mês.
          </p>
          {!atual.length ? <p className="nota">Nenhum consumo registrado neste mês.</p> : (
            <ul className="aud-lista">
              {atual.map(u => (
                <li key={u.sku}>
                  <span>{SKU[u.sku] ?? u.sku}</span>
                  <span><b>{u.used_events.toLocaleString('pt-BR')}</b> de {u.free_cap.toLocaleString('pt-BR')} ({pct(u.used_events, u.free_cap)}%) · restam {Math.max(0, u.free_cap - u.used_events).toLocaleString('pt-BR')}</span>
                  <meter min={0} max={u.free_cap || 1} low={(u.free_cap || 1) * 0.7} high={(u.free_cap || 1) * 0.85} optimum={0} value={u.used_events} aria-label={`Uso de ${SKU[u.sku] ?? u.sku}`} />
                </li>
              ))}
            </ul>
          )}
          <p className="nota">Custo estimado no mês: <b>US$ {custo.toFixed(2)}</b> (zero dentro da cota grátis; referência por 1.000 eventos acima dela: rotas US$ {PRECO_MIL.routes}, mapa US$ {PRECO_MIL.map_load}, tiles US$ {PRECO_MIL.map_tiles}; confira a tabela atual do Google).</p>
          {!!avisos?.length && <ul className="aud-lista">{avisos.map(a => <li key={`${a.sku}${a.level}${a.created_at}`}><span>Aviso {a.level}%</span><span>{SKU[a.sku] ?? a.sku} · {dia(a.created_at)}</span></li>)}</ul>}
        </section>

        <section id="uso" aria-labelledby="t-uso">
          <h2 className="conta-tit" id="t-uso">Chamadas de rota e mapa (30 dias)</h2>
          <p className="nota">{lista.length.toLocaleString('pt-BR')} cálculos · {google.length.toLocaleString('pt-BR')} no Google · {fallbacks} trocas automáticas de provedor (fallback).</p>
          <h3>Por dia e provedor</h3>
          {!porDia.length ? <p className="nota">Nada ainda.</p> : (
            <ul className="aud-lista">{porDia.map(([d, p]) => <li key={d}><time dateTime={d}>{d.split('-').reverse().slice(0, 2).join('/')}</time><span>{Object.entries(p).map(([k, v]) => `${PROV[k] ?? k}: ${v}`).join(' · ')}</span></li>)}</ul>
          )}
          <h3>Google por pedido</h3>
          {!top('order_id').length ? <p className="nota">Nenhuma chamada ao Google.</p> : <ul className="aud-lista">{top('order_id').map(([id, n]) => <li key={id}><span>#{numPedido.get(id) ?? id.slice(0, 8)}</span><span>{n}</span></li>)}</ul>}
          <h3>Google por restaurante</h3>
          {!top('restaurant_id').length ? <p className="nota">—</p> : <ul className="aud-lista">{top('restaurant_id').map(([id, n]) => <li key={id}><span>{nomeLoja.get(id) ?? id.slice(0, 8)}</span><span>{n}</span></li>)}</ul>}
          <h3>Google por entregador</h3>
          {!top('courier_id').length ? <p className="nota">—</p> : <ul className="aud-lista">{top('courier_id').map(([id, n]) => <li key={id}><span>Entregador {id.slice(0, 8)}</span><span>{n}</span></li>)}</ul>}
        </section>
      </div>
    </main>
  );
}
