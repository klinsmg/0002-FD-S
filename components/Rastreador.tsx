'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmarEntrega, devolverEntrega, type Motivo } from '@/app/entregador/actions';
import { distanciaM } from '@/lib/regras';

type Pos = { lat: number; lng: number; acc: number; vel: number | null; t: number };
type Estado = 'aviso' | 'pedindo' | 'ativo' | 'negado' | 'indisponivel' | 'encerrado';

const CONSENTIMENTO = 'gps-aviso-v1';
const FILA = (id: string) => `gps-fila-${id}`;
const MOVENDO_S = 7, PARADO_S = 25;   // intervalo de envio: em movimento / parado
const VALIDADE_MS = 110_000;          // o servidor descarta posição com mais de 2 min

// distância só para mostrar; quem decide é o servidor
const distancia = distanciaM;
const lerFila = (id: string): Pos[] => { try { return JSON.parse(localStorage.getItem(FILA(id)) || '[]'); } catch { return []; } };
const gravarFila = (id: string, f: Pos[]) => { try { localStorage.setItem(FILA(id), JSON.stringify(f.slice(-30))); } catch {} };

// GPS do entregador: aviso LGPD -> watchPosition -> envia a cada 7 s em movimento / 25 s parado, com fila local para
// reenviar quando a internet volta. "Entregue" só libera perto do endereço e com GPS preciso; o servidor confere de novo.
export default function Rastreador({ id, destino, raio, precisaoMax, iniciada }: { id: string; destino: { lat: number; lng: number }; raio: number; precisaoMax: number; iniciada: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('aviso');
  const [pos, setPos] = useState<Pos | null>(null);
  const [online, setOnline] = useState(true);
  const [pendentes, setPendentes] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ultima = useRef<Pos | null>(null);        // posição mais recente do GPS
  const enviada = useRef<Pos | null>(null);       // última enviada com sucesso
  const relogio = useRef(0);                      // quando foi o último envio
  const watch = useRef<number | null>(null);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);

  const parar = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    void lock.current?.release().catch(() => {});
    lock.current = null;
  }, []);

  // envia uma posição; devolve false se falhou a rede (vai para a fila)
  const enviar = useCallback(async (p: Pos): Promise<boolean> => {
    try {
      const r = await fetch(`/api/entregas/${id}/posicao`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ latitude: p.lat, longitude: p.lng, precisaoMetros: Math.round(p.acc * 10) / 10, velocidadeKmh: p.vel, capturadoEm: new Date(p.t).toISOString() }),
      });
      if (r.status === 403 || r.status === 401) { parar(); setEstado('encerrado'); setMsg('Esta entrega não está mais com você.'); return true; }
      if (!r.ok) return false;
      enviada.current = p;
      return true;
    } catch { return false; }
  }, [id, parar]);

  // fila: primeiro o que ficou pendente (descarta o que já venceu), depois a posição nova
  const despachar = useCallback(async (p: Pos | null) => {
    relogio.current = Date.now();
    const fila = lerFila(id).filter(x => Date.now() - x.t < VALIDADE_MS);
    if (p) fila.push(p);
    const resto: Pos[] = [];
    for (const x of fila) if (resto.length || !(await enviar(x))) resto.push(x);
    gravarFila(id, resto);
    setPendentes(resto.length);
  }, [id, enviar]);

  function iniciar() {
    try { localStorage.setItem(CONSENTIMENTO, '1'); } catch {}
    if (!('geolocation' in navigator)) { setEstado('indisponivel'); return; }
    setEstado('pedindo');
    watch.current = navigator.geolocation.watchPosition(
      g => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude, acc: g.coords.accuracy, vel: g.coords.speed == null ? null : Math.round(g.coords.speed * 3.6 * 10) / 10, t: g.timestamp || Date.now() };
        ultima.current = p; setPos(p); setEstado('ativo');
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) { parar(); setEstado('negado'); }
        else if (err.code === err.POSITION_UNAVAILABLE) setEstado(e => (e === 'ativo' ? e : 'indisponivel'));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    // tela acesa durante a entrega (o navegador pausa o GPS com a tela apagada)
    (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen').then(l => { lock.current = l; }).catch(() => {});
  }

  // entrega já em andamento (ex.: recarregou a página no caminho) e aviso já visto: religa o GPS sozinho.
  // Entrega nova: espera o entregador aceitar (ou recusar) — aceitar = ligar a localização.
  const [jaViu, setJaViu] = useState(false);
  useEffect(() => {
    let visto = false;
    try { visto = localStorage.getItem(CONSENTIMENTO) === '1'; } catch {}
    setJaViu(visto);
    if (visto && iniciada) iniciar();
    setPendentes(lerFila(id).length);
    const on = () => { setOnline(true); void despachar(null); }, off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { parar(); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // relógio de envio: em movimento a cada 7 s, parado a cada 25 s
  useEffect(() => {
    if (estado !== 'ativo') return;
    const t = setInterval(() => {
      const p = ultima.current, e = enviada.current;
      if (!p || (e && p.t <= e.t)) return;
      const movendo = !e || (p.vel ?? 0) > 5 || distancia(p, e) > 15;
      if (Date.now() - relogio.current >= (movendo ? MOVENDO_S : PARADO_S) * 1000) void despachar(p);
    }, 1000);
    return () => clearInterval(t);
  }, [estado, despachar]);

  const [devolvendo, setDevolvendo] = useState<Motivo | null>(null);
  async function devolver(m: Motivo) {
    setOcupado(true); setMsg('');
    const r = await devolverEntrega(id, m);
    setOcupado(false); setDevolvendo(null);
    if ('ok' in r) { parar(); setEstado('encerrado'); setMsg(m === 'recusada' ? 'Pronto, a loja foi avisada e vai mandar outra pessoa.' : 'A loja foi avisada. Leve o pedido de volta.'); router.refresh(); return; }
    setMsg(r.erro);
  }

  async function entregue() {
    setOcupado(true); setMsg('');
    if (ultima.current) await despachar(ultima.current); // garante que o servidor tem a posição de agora
    const r = await confirmarEntrega(id);
    setOcupado(false); setConfirmando(false);
    if ('ok' in r) { parar(); setEstado('encerrado'); setMsg('Entrega confirmada! Valeu! 🧡'); router.refresh(); return; }
    setMsg(r.erro);
  }

  const dist = pos ? Math.round(distancia(pos, destino)) : null;
  const fresca = pos && Date.now() - pos.t < 30_000;
  const precisa = pos ? pos.acc <= precisaoMax : false;
  const perto = dist !== null && dist <= raio;
  const pode = estado === 'ativo' && !!fresca && precisa && perto;
  const rota = `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lng}&travelmode=driving`;

  if (estado === 'aviso') {
    return (
      <section className="ent-aviso" aria-labelledby="ent-aviso-t">
        <h2 id="ent-aviso-t" className="conta-tit">{jaViu ? 'Nova entrega' : 'Antes de sair: sua localização'}</h2>
        <p>Enquanto esta entrega estiver ativa, o MDogão usa o GPS do seu celular para mostrar ao cliente onde o pedido está e para confirmar a entrega no endereço.</p>
        <ul>
          <li>A coleta acontece <b>só durante entregas ativas</b> e para quando a entrega é finalizada ou você sai desta tela.</li>
          <li>O cliente vê só uma <b>posição aproximada</b>, o status e a previsão de chegada.</li>
          <li>O histórico das posições é apagado <b>30 dias</b> depois da entrega.</li>
        </ul>
        <p className="nota">Detalhes e seus direitos na <Link href="/politica-de-privacidade#entregadores">Política de privacidade</Link>.</p>
        <button type="button" className="btn btn-p ent-aceitar" onClick={iniciar}>{iniciada ? 'Ligar localização' : 'Aceitar e sair para entrega'}</button>
        {!iniciada && !devolvendo && <button type="button" className="btn btn-o" onClick={() => setDevolvendo('recusada')}>Recusar entrega</button>}
        {devolvendo && (
          <div className="ent-confirma" role="group" aria-label="Confirmar recusa">
            <p><b>Recusar esta entrega?</b> A loja é avisada na hora e manda outra pessoa.</p>
            <button type="button" className="btn btn-p" disabled={ocupado} onClick={() => devolver(devolvendo)}>{ocupado ? 'Avisando a loja…' : 'Sim, recusar'}</button>
            <button type="button" className="btn btn-o" disabled={ocupado} onClick={() => setDevolvendo(null)}>Voltar</button>
          </div>
        )}
        {msg && <p className="nota ent-msg" role="alert">{msg}</p>}
      </section>
    );
  }

  return (
    <section className="ent-gps" aria-live="polite">
      <p className={`ent-sinal ent-${estado}`}>
        {estado === 'pedindo' && 'Procurando o sinal do GPS…'}
        {estado === 'ativo' && (online ? 'Localização ligada · enviando para a loja' : 'Sem internet · guardando posições para enviar depois')}
        {estado === 'negado' && 'A localização está bloqueada para este site.'}
        {estado === 'indisponivel' && 'GPS indisponível agora. Verifique se a localização do celular está ligada.'}
        {estado === 'encerrado' && 'Localização desligada.'}
      </p>
      {estado === 'negado' && <p className="nota">Para entregar, libere a localização: toque no cadeado ao lado do endereço do site › Permissões › Localização › Permitir. Depois recarregue a página.</p>}
      {pendentes > 0 && <p className="nota">{pendentes} {pendentes === 1 ? 'posição aguardando' : 'posições aguardando'} internet.</p>}

      {pos && estado === 'ativo' && (
        <ul className="canais">
          <li><b>Até o endereço</b><span>{dist! >= 1000 ? `${(dist! / 1000).toFixed(1)} km` : `${dist} m`} (em linha reta)</span></li>
          <li><b>Precisão do GPS</b><span>{Math.round(pos.acc)} m{precisa ? '' : ' · fraca'}</span></li>
        </ul>
      )}

      {estado !== 'encerrado' && <a className="btn btn-o" href={rota} target="_blank" rel="noopener noreferrer">Abrir rota no Google Maps</a>}

      {estado === 'ativo' && !confirmando && (
        <>
          <button type="button" className="btn btn-p ent-entregue" disabled={!pode} onClick={() => setConfirmando(true)}>Entregue</button>
          {!pode && (
            <p className="nota">
              {!fresca ? 'Aguardando uma posição atual do GPS…'
                : !precisa ? `Sinal do GPS fraco (${Math.round(pos!.acc)} m). Aguarde o sinal melhorar: precisa ser até ${precisaoMax} m. Fique parado em céu aberto por alguns segundos.`
                  : `O botão libera quando você estiver a até ${raio} m do endereço.`}
            </p>
          )}
        </>
      )}
      {confirmando && (
        <div className="ent-confirma" role="group" aria-label="Confirmar entrega">
          <p><b>Confirmar que o pedido foi entregue ao cliente?</b></p>
          <button type="button" className="btn btn-p" disabled={ocupado} onClick={entregue}>{ocupado ? 'Confirmando…' : 'Sim, entreguei'}</button>
          <button type="button" className="btn btn-o" disabled={ocupado} onClick={() => setConfirmando(false)}>Voltar</button>
        </div>
      )}
      {estado !== 'encerrado' && !confirmando && (
        <details className="ent-problema">
          <summary>{iniciada ? 'Não consegui entregar' : 'Não posso levar este pedido'}</summary>
          {devolvendo ? (
            <div className="ent-confirma" role="group" aria-label="Confirmar devolução">
              <p><b>{devolvendo === 'recusada' ? 'Recusar esta entrega?' : 'Devolver o pedido para a loja?'}</b> O pedido volta para a loja, que manda de novo ou cancela.</p>
              <button type="button" className="btn btn-p" disabled={ocupado} onClick={() => devolver(devolvendo)}>{ocupado ? 'Avisando a loja…' : 'Sim, avisar a loja'}</button>
              <button type="button" className="btn btn-o" disabled={ocupado} onClick={() => setDevolvendo(null)}>Voltar</button>
            </div>
          ) : (
            <div className="ent-motivos">
              {!iniciada && <button type="button" className="btn btn-o" onClick={() => setDevolvendo('recusada')}>Recusar entrega</button>}
              {iniciada && <button type="button" className="btn btn-o" onClick={() => setDevolvendo('cliente_ausente')}>Cliente ausente</button>}
              {iniciada && <button type="button" className="btn btn-o" onClick={() => setDevolvendo('endereco_nao_encontrado')}>Endereço não encontrado</button>}
              <button type="button" className="btn btn-o" onClick={() => setDevolvendo('outro')}>Outro motivo</button>
            </div>
          )}
        </details>
      )}
      {msg && <p className="nota ent-msg" role="alert">{msg}</p>}
      {estado === 'encerrado' && <p><Link href="/entregador">Voltar para as entregas</Link></p>}
    </section>
  );
}
