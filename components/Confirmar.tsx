'use client';
import { useId, useRef } from 'react';

type Props = {
  action: (f: FormData) => void | Promise<void>;
  mensagem: string;                       // pergunta específica, ex.: "Remover o endereço Rua X, 10?"
  detalhe?: string;                       // consequência, ex.: "Essa ação não pode ser desfeita."
  rotulo: string;                         // texto do botão de confirmar, ex.: "Remover"
  perigo?: boolean;                       // ação destrutiva: botão vermelho
  quando?: { campo: string; valor: string }; // só pede confirmação se o campo do form tiver esse valor
  className?: string;
  children: React.ReactNode;              // campos do form + o botão de envio
};

// Formulário que pede confirmação num modal (<dialog> nativo: foco preso, Esc fecha) antes de rodar a Server Action.
// O foco abre em "Cancelar", para um Enter apressado não confirmar uma exclusão.
export default function Confirmar({ action, mensagem, detalhe, rotulo, perigo = true, quando, className, children }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const ok = useRef(false);
  const id = useId();

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    if (ok.current) { ok.current = false; return; }                      // já confirmado: segue para a action
    if (quando && new FormData(e.currentTarget).get(quando.campo) !== quando.valor) return;
    e.preventDefault();
    dlg.current?.showModal();
  }
  function confirmar() {
    ok.current = true;
    dlg.current?.close();
    form.current?.requestSubmit();
  }

  return (
    <form ref={form} action={action} onSubmit={aoEnviar} className={className}>
      {children}
      <dialog ref={dlg} className="confirmar" aria-labelledby={`${id}-t`} aria-describedby={detalhe ? `${id}-d` : undefined}>
        <p className="confirmar-tit" id={`${id}-t`}>{mensagem}</p>
        {detalhe && <p className="confirmar-det" id={`${id}-d`}>{detalhe}</p>}
        <div className="confirmar-acoes">
          <button type="button" className="btn btn-o" autoFocus onClick={() => dlg.current?.close()}>Cancelar</button>
          <button type="button" className={`btn ${perigo ? 'btn-perigo' : 'btn-p'}`} onClick={confirmar}>{rotulo}</button>
        </div>
      </dialog>
    </form>
  );
}
