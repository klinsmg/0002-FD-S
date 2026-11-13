'use client';
import { useEffect, useRef, useState } from 'react';
import { abrirConvite, enviarAvaliacao, recusarConvite, registrarGoogle } from '@/app/conta/avaliacao/actions';

const ROTULOS = ['', 'Vish…', 'Dá pra melhorar', 'Ok, honesto', 'Muito bom!', 'Sensacional!'];

// Pop-up de avaliação. Quem decide se aparece é o banco (review_invite): 3+ pedidos entregues, uma vez por pedido,
// nunca depois de avaliar ou de 2 recusas. Passo 1: estrelas + comentário (salvo no nosso banco).
// Passo 2: convite para publicar no Google, para QUALQUER nota (sem filtro). Nada é publicado por nós.
export default function ConviteAvaliacao({ google }: { google: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [convite, setConvite] = useState<{ pedido: string; numero: number } | null>(null);
  const [fase, setFase] = useState<'nota' | 'google' | 'fim'>('nota');
  const [nota, setNota] = useState(0);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [copiou, setCopiou] = useState<boolean | null>(null);

  useEffect(() => {
    // espera a página assentar antes de perguntar
    const t = setTimeout(async () => {
      const c = await abrirConvite().catch(() => null);
      if (c) { setConvite(c); dlg.current?.showModal(); }
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  // fechar (X, Esc ou "Agora não"): no 1º passo conta como recusa; depois de avaliar, só fecha
  function fechar() {
    if (fase === 'nota' && convite) void recusarConvite(convite.pedido);
    dlg.current?.close();
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!convite) return;
    if (!nota) { setErro('Escolhe de 1 a 5 estrelas aí.'); return; }
    setOcupado(true); setErro('');
    const r = await enviarAvaliacao(convite.pedido, nota, texto.trim());
    setOcupado(false);
    if ('erro' in r) { setErro(r.erro); return; }
    setFase(google ? 'google' : 'fim');
  }

  async function publicar() {
    const t = texto.trim();
    let ok = !t; // sem comentário, não há o que copiar
    if (t) { try { await navigator.clipboard.writeText(t); ok = true; } catch { ok = false; } }
    window.open(google, '_blank', 'noopener,noreferrer');
    void registrarGoogle();
    setCopiou(ok);
    setFase('fim');
  }

  async function copiarDeNovo() {
    try { await navigator.clipboard.writeText(texto.trim()); setCopiou(true); } catch { /* segue com o campo para copiar à mão */ }
  }

  if (!convite) return null;
  return (
    <dialog ref={dlg} className="confirmar aval" aria-labelledby="aval-tit" onCancel={e => { e.preventDefault(); fechar(); }}>
      <button type="button" className="aval-x" aria-label="Fechar" onClick={fechar}>×</button>

      {fase === 'nota' && (
        <form onSubmit={enviar}>
          <h2 className="confirmar-tit" id="aval-tit">E aí, curtiu o rango? 🌭</h2>
          <p className="confirmar-det">Já são 3 pedidos entregues, você é de casa! Conta pra gente como foi o pedido #{convite.numero}. Leva 10 segundos.</p>
          <fieldset className="aval-estrelas">
            <legend>Sua nota</legend>
            {[1, 2, 3, 4, 5].map(n => (
              <label key={n} className={n <= nota ? 'on' : undefined}>
                <input type="radio" name="nota" value={n} checked={nota === n} onChange={() => setNota(n)} />
                <span aria-hidden="true">★</span>
                <span className="sr">{n} {n === 1 ? 'estrela' : 'estrelas'}</span>
              </label>
            ))}
            <output aria-live="polite">{ROTULOS[nota]}</output>
          </fieldset>
          <label className="aval-lbl" htmlFor="aval-txt">Comentário (opcional)</label>
          <textarea id="aval-txt" maxLength={1000} rows={3} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Conta aí: o que mandou bem, o que dá pra melhorar…" />
          {erro && <p className="aval-erro" role="alert">{erro}</p>}
          <div className="confirmar-acoes">
            <button type="button" className="btn btn-o" onClick={fechar}>Agora não</button>
            <button type="submit" className="btn btn-p" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar avaliação'}</button>
          </div>
        </form>
      )}

      {fase === 'google' && (
        <>
          <h2 className="confirmar-tit" id="aval-tit">Valeu demais! 🧡</h2>
          <p className="confirmar-det">Sua avaliação ficou salva aqui com a gente. Quer dar uma força e publicar no Google também? Ajuda muita gente com fome a achar o MDogão.</p>
          {texto.trim() && <p className="confirmar-det">A gente copia o seu comentário pra você só colar lá.</p>}
          <div className="confirmar-acoes">
            <button type="button" className="btn btn-o" onClick={fechar}>Agora não</button>
            <button type="button" className="btn btn-p" onClick={publicar}>Publicar no Google</button>
          </div>
        </>
      )}

      {fase === 'fim' && (
        <>
          <h2 className="confirmar-tit" id="aval-tit">{copiou === null ? 'Valeu demais! 🧡' : 'Abrimos o Google pra você'}</h2>
          {copiou === null && <p className="confirmar-det">Sua avaliação ficou salva aqui com a gente.</p>}
          {copiou === true && texto.trim() && <p className="confirmar-det" role="status">Texto copiado! É só colar na avaliação do Google.</p>}
          {copiou === true && !texto.trim() && <p className="confirmar-det">A página de avaliação abriu numa nova aba. Valeu pela força!</p>}
          {copiou === false && (
            <>
              <p className="confirmar-det">Não deu pra copiar sozinho. Copia o texto abaixo e cola na avaliação do Google:</p>
              <textarea className="aval-copia" readOnly rows={3} value={texto.trim()} onFocus={e => e.currentTarget.select()} aria-label="Seu comentário" />
              <button type="button" className="btn btn-o" onClick={copiarDeNovo}>Copiar</button>
            </>
          )}
          <div className="confirmar-acoes">
            <button type="button" className="btn btn-p" onClick={() => dlg.current?.close()}>Fechar</button>
          </div>
        </>
      )}
    </dialog>
  );
}
