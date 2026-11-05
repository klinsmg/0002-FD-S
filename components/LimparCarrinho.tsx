'use client';
import { useEffect } from 'react';

// Pedido gravado: esvazia o carrinho guardado no navegador (mantém nome e endereço para o próximo pedido).
export default function LimparCarrinho() {
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem('dogao-pedido') || '{}');
      localStorage.setItem('dogao-pedido', JSON.stringify({ ...d, itens: [], obs: '' }));
    } catch { /* sem localStorage: nada a fazer */ }
  }, []);
  return null;
}
