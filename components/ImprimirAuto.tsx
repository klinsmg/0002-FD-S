'use client';
import { useEffect } from 'react';

// Abre a janela de impressão assim que o cupom carrega. Os botões só aparecem na tela (somem no papel).
export default function ImprimirAuto({ largura }: { largura: string }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300); // deixa a fonte assentar antes
    return () => clearTimeout(t);
  }, []);
  return (
    <nav className="cupom-acoes" aria-label="Impressão">
      <button type="button" className="btn btn-p" onClick={() => window.print()}>Imprimir</button>
      <a className={`btn ${largura === '80' ? 'btn-p' : 'btn-o'}`} href="?l=80">80 mm</a>
      <a className={`btn ${largura === '58' ? 'btn-p' : 'btn-o'}`} href="?l=58">58 mm</a>
      <button type="button" className="btn btn-o" onClick={() => window.close()}>Fechar</button>
    </nav>
  );
}
