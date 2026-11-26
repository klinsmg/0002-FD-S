'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { confirmarEntrega, devolverEntrega, type Motivo } from '@/app/entregador/actions';

// Ações do entregador numa entrega em andamento: dar baixa ("Entregue"), recusar ou devolver para a loja.
// Cada ação pede confirmação; quem decide é o banco (só o entregador da entrega, com a conta ativa).
export default function BaixaEntrega({ id, rota }: { id: string; rota: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [devolvendo, setDevolvendo] = useState<Motivo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState('');
  const [fim, setFim] = useState('');

  async function entregue() {
    setOcupado(true); setMsg('');
    const r = await confirmarEntrega(id);
    setOcupado(false); setConfirmando(false);
    if ('ok' in r) { setFim('Baixa feita: pedido entregue. Obrigado!'); router.refresh(); return; }
    setMsg(r.erro);
  }
  async function devolver(m: Motivo) {
    setOcupado(true); setMsg('');
    const r = await devolverEntrega(id, m);
    setOcupado(false); setDevolvendo(null);
    if ('ok' in r) { setFim(m === 'recusada' ? 'Pronto, a loja foi avisada e vai mandar outra pessoa.' : 'A loja foi avisada. Leve o pedido de volta.'); router.refresh(); return; }
    setMsg(r.erro);
  }

  if (fim) return <section className="ent-acoes" aria-live="polite"><p className="ent-msg" role="status">{fim}</p><p><Link href="/entregador">Voltar para as entregas</Link></p></section>;

  return (
    <section className="ent-acoes" aria-live="polite">
      {rota && <a className="btn btn-o" href={rota} target="_blank" rel="noopener noreferrer">Abrir rota no Google Maps</a>}
      {!confirmando && !devolvendo && <button type="button" className="btn btn-p ent-entregue" onClick={() => setConfirmando(true)}>Entregue</button>}
      {confirmando && (
        <div className="ent-confirma" role="group" aria-label="Confirmar entrega">
          <p><b>Confirmar que o pedido foi entregue ao cliente?</b></p>
          <button type="button" className="btn btn-p" disabled={ocupado} onClick={entregue}>{ocupado ? 'Dando baixa…' : 'Sim, entreguei'}</button>
          <button type="button" className="btn btn-o" disabled={ocupado} onClick={() => setConfirmando(false)}>Voltar</button>
        </div>
      )}
      {!confirmando && (
        <details className="ent-problema">
          <summary>Não posso levar / não consegui entregar</summary>
          {devolvendo ? (
            <div className="ent-confirma" role="group" aria-label="Confirmar devolução">
              <p><b>{devolvendo === 'recusada' ? 'Recusar esta entrega?' : 'Devolver o pedido para a loja?'}</b> O pedido volta para a loja, que manda de novo ou cancela.</p>
              <button type="button" className="btn btn-p" disabled={ocupado} onClick={() => devolver(devolvendo)}>{ocupado ? 'Avisando a loja…' : 'Sim, avisar a loja'}</button>
              <button type="button" className="btn btn-o" disabled={ocupado} onClick={() => setDevolvendo(null)}>Voltar</button>
            </div>
          ) : (
            <div className="ent-motivos">
              <button type="button" className="btn btn-o" onClick={() => setDevolvendo('recusada')}>Recusar entrega</button>
              <button type="button" className="btn btn-o" onClick={() => setDevolvendo('cliente_ausente')}>Cliente ausente</button>
              <button type="button" className="btn btn-o" onClick={() => setDevolvendo('endereco_nao_encontrado')}>Endereço não encontrado</button>
              <button type="button" className="btn btn-o" onClick={() => setDevolvendo('outro')}>Outro motivo</button>
            </div>
          )}
        </details>
      )}
      {msg && <p className="nota ent-msg" role="alert">{msg}</p>}
    </section>
  );
}
