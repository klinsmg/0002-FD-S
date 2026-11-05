'use client';
import { useActionState } from 'react';
import { createOrder, type Estado } from '@/app/(site)/checkout/actions';

// Formulário oculto do carrinho: o Alpine (lib/carrinho.ts, finalizar()) preenche #payload e dispara o envio.
// Fica aqui, em React, só para chamar a Server Action e mostrar o erro devolvido.
export default function FormPedido() {
  const [estado, acao] = useActionState<Estado, FormData>(createOrder, null);
  return (
    <form id="form-pedido" action={acao}>
      <input type="hidden" name="payload" id="payload" />
      {estado?.erro && <p className="erro" role="alert">{estado.erro}</p>}
    </form>
  );
}
