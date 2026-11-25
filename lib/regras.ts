// Regras puras do negócio (sem Next, sem Supabase): usadas pelo servidor, pelo navegador e pelos testes (tests/unit).
// O banco confere as mesmas regras de novo (migrations 012 e 015); aqui elas decidem só o que mostrar e validam cedo.

export type Status = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
export const STATUS_LISTA: Status[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

// Fluxo da loja (o banco confere o mesmo: função order_status_ok):
//   Novo -> Em preparo -> Pronto -> entrega: "Saiu para entrega" (só pelo despacho, escolhendo o entregador)
//                                   retirada: Entregue ("Retirado").
// "Entregue" de pedido de ENTREGA nunca sai do painel: só o entregador confirma, no endereço.
export function proximos(de: Status, tipo: string): Status[] {
  switch (de) {
    case 'pending': case 'confirmed': return ['preparing', 'cancelled'];
    case 'preparing': return ['ready', 'cancelled'];
    case 'ready': return tipo === 'delivery' ? ['cancelled'] : ['delivered', 'cancelled'];
    case 'out_for_delivery': return ['cancelled'];
    default: return [];
  }
}
export const podeIr = (de: Status, para: Status, tipo: string) => proximos(de, tipo).includes(para);

// Endereço de entrega (jsonb do pedido) em uma linha
export const enderecoTexto = (e: unknown) => {
  if (!e || typeof e !== 'object') return '';
  const a = e as Record<string, string | undefined>;
  return [`${a.street ?? ''}, ${a.number ?? ''}${a.complement ? ` – ${a.complement}` : ''}`, a.district, a.city && `${a.city}/${a.state ?? ''}`, a.reference && `Ref.: ${a.reference}`].filter(Boolean).join(' · ');
};

// "12,50" / "1.234,50" / "12.5" -> centavos. Vazio -> null (valor a confirmar). Inválido -> undefined.
export function paraCentavos(v: unknown, max = 999999): number | null | undefined {
  const s = String(v ?? '').replace(/R\$|\s/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  const c = Math.round(n * 100);
  return Number.isFinite(n) && c >= 0 && c <= max ? c : undefined;
}
export const doisDec = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

// Distância em metros entre dois pontos (haversine; a mesma fórmula da função distance_m do banco)
export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// ETA de reserva (sem Routes API): linha reta x1,4 pelo traçado das ruas, a 25 km/h de média urbana
export function etaEstimada(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const km = (distanciaM(a, b) / 1000) * 1.4;
  return { minutos: Math.max(1, Math.round((km / 25) * 60)), km: Math.round(km * 10) / 10 };
}

// Arredonda a posição exibida ao cliente (~100 m): ele nunca vê a posição exata do entregador
export const aproximar = (x: number) => Math.round(x * 1000) / 1000;

// Horários do banco (business_hours) -> linhas para o site, juntando dias seguidos iguais:
// [['Segunda a sexta', '11h às 01h'], ['Sábado e domingo', '18h às 01h']]. Semana começa na segunda.
export type Horario = { weekday: number; opens_at: string | null; closes_at: string | null; closed: boolean };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const hhmm = (t: string | null) => { if (!t) return ''; const [h, m] = t.split(':'); return `${h}h${m && m !== '00' ? m : ''}`; };
export function agruparHorarios(linhas: Horario[]): [string, string][] {
  const ordem = [1, 2, 3, 4, 5, 6, 0].map(d => linhas.find(l => l.weekday === d)).filter(Boolean) as Horario[];
  const texto = (l: Horario) => (l.closed || !l.opens_at || !l.closes_at ? 'Fechado' : `${hhmm(l.opens_at)} às ${hhmm(l.closes_at)}`);
  const grupos: { de: number; ate: number; t: string }[] = [];
  for (const l of ordem) {
    const g = grupos.at(-1), t = texto(l);
    if (g && g.t === t && (g.ate + 1) % 7 === l.weekday) g.ate = l.weekday; else grupos.push({ de: l.weekday, ate: l.weekday, t });
  }
  return grupos.map(g => {
    const n = (g.ate - g.de + 7) % 7;
    const rot = n === 0 ? DIAS[g.de] : n === 1 ? `${DIAS[g.de]} e ${DIAS[g.ate].toLowerCase()}` : `${DIAS[g.de]} a ${DIAS[g.ate].toLowerCase()}`;
    return [rot, g.t];
  });
}

// ---------- rastreamento: polyline, desvio, ETA local e quando recalcular a rota ----------
type P = { lat: number; lng: number };

// Polyline codificada (formato do Google e do OSRM com geometries=polyline, precisão 5) -> pontos. Limita o tamanho.
export function decodificarPolyline(s: string, max = 5000): P[] {
  const pts: P[] = [];
  let i = 0, lat = 0, lng = 0;
  const parte = () => {
    let r = 0, sh = 0, b: number;
    do { if (i >= s.length) return null; b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20 && sh < 35);
    return r & 1 ? ~(r >> 1) : r >> 1;
  };
  while (i < s.length && pts.length < max) {
    const a = parte(), b = parte();
    if (a === null || b === null) break;
    lat += a; lng += b;
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

// Distância (m) do ponto até a rota (segmento mais próximo; projeção plana local, boa para poucos km)
export function distanciaAteRota(p: P, rota: P[]): number {
  if (!rota.length) return Infinity;
  if (rota.length === 1) return distanciaM(p, rota[0]);
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180), ky = 110540;
  let min = Infinity;
  for (let i = 1; i < rota.length; i++) {
    const ax = (rota[i - 1].lng - p.lng) * kx, ay = (rota[i - 1].lat - p.lat) * ky;
    const bx = (rota[i].lng - p.lng) * kx, by = (rota[i].lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}

// ETA local (navegador e servidor), entre recálculos de rota: mistura o que sobrou da última ETA calculada (menos o
// tempo decorrido) com distância restante / velocidade média recente do entregador. Sem nada disso: estimativa urbana.
export function etaLocal(x: { etaRotaMin: number | null; calculadoEm: number | null; agora: number; restanteM: number | null; velocidades: number[] }): number | null {
  const vs = x.velocidades.filter(v => Number.isFinite(v) && v >= 3 && v <= 120).slice(-8);
  const vel = vs.length >= 2 ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  const porRota = x.etaRotaMin !== null && x.calculadoEm !== null ? Math.max(0, x.etaRotaMin - (x.agora - x.calculadoEm) / 60000) : null;
  const porVel = x.restanteM !== null && vel !== null && vel >= 8 ? ((x.restanteM * 1.3) / 1000 / vel) * 60 : null;
  const porDist = x.restanteM !== null ? ((x.restanteM * 1.4) / 1000 / 25) * 60 : null;
  const v = porRota !== null && porVel !== null ? (porRota + porVel) / 2 : porRota ?? porVel ?? porDist;
  return v === null ? null : Math.max(1, Math.round(v));
}

// Quando recalcular a rota. Recalcular é caro (Google) ou custa CPU (OSRM); GPS é barato e não recalcula nada sozinho.
//  - nunca antes do intervalo mínimo (padrão 2 min), salvo a primeira rota
//  - gatilhos reais (podem usar o Google): saiu para entrega/início, virou "a caminho", desvio da rota, perto do
//    destino, pedido manual do cliente
//  - sem gatilho, depois do intervalo: recálculo periódico, SÓ no provedor gratuito (OSRM)
export type Recalculo = { recalcular: boolean; motivo: string; podeGoogle: boolean };
export function deveRecalcular(x: {
  agora: number; ultimaRotaEm: number | null; intervaloMs: number; posicao: P | null; destino: P; rota: P[];
  virouEmRota?: boolean; manual?: boolean; desvioM?: number; pertoM?: number;
}): Recalculo {
  if (x.ultimaRotaEm === null) return { recalcular: true, motivo: 'inicio', podeGoogle: true };
  if (x.agora - x.ultimaRotaEm < x.intervaloMs) return { recalcular: false, motivo: 'intervalo', podeGoogle: false };
  if (x.manual) return { recalcular: true, motivo: 'manual', podeGoogle: true };
  if (x.virouEmRota) return { recalcular: true, motivo: 'em_rota', podeGoogle: true };
  if (x.posicao) {
    if (x.rota.length > 1 && distanciaAteRota(x.posicao, x.rota) > (x.desvioM ?? 150)) return { recalcular: true, motivo: 'desvio', podeGoogle: true };
    if (distanciaM(x.posicao, x.destino) < (x.pertoM ?? 800)) return { recalcular: true, motivo: 'perto', podeGoogle: true };
  }
  return { recalcular: true, motivo: 'periodico', podeGoogle: false };
}

// Chave do cache de rota: origem/destino arredondados (~100 m), modo e janela de horário (15 min)
export const chaveRota = (o: P, d: P, modo: string, agora: number) =>
  `${modo}:${aproximar(o.lat)},${aproximar(o.lng)}>${aproximar(d.lat)},${aproximar(d.lng)}@${Math.floor(agora / 900000)}`;

// "-23.5367, -46.9342" (vírgula ou espaço) -> ponto
export function lerCoords(v: string): { lat: number; lng: number } | null {
  const m = v.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// Área Dev do painel (mapas, cota do Google, auditoria, regras técnicas da entrega): só os e-mails de ADMIN_DEV_EMAILS
// (separados por vírgula). Sem a variável, todo admin é Dev — assim ninguém fica trancado fora antes de configurar.
export function ehDev(email: string | null | undefined, lista = process.env.ADMIN_DEV_EMAILS ?? '') {
  const devs = lista.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return !devs.length || (!!email && devs.includes(email.trim().toLowerCase()));
}

// ---------- SEO: horário do banco no formato schema.org (OpeningHoursSpecification) ----------
// Dias com o mesmo horário viram uma linha; fechado não entra (schema.org: ausência = fechado).
const DIAS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function horariosSchema(linhas: Horario[]) {
  const grupos = new Map<string, string[]>();
  for (const l of [...linhas].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))) {
    if (l.closed || !l.opens_at || !l.closes_at) continue;
    const k = `${l.opens_at.slice(0, 5)}|${l.closes_at.slice(0, 5)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), DIAS_EN[l.weekday]]);
  }
  return [...grupos].map(([k, dias]) => { const [opens, closes] = k.split('|'); return { '@type': 'OpeningHoursSpecification', dayOfWeek: dias, opens, closes }; });
}
