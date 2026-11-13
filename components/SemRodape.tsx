'use client';
import { usePathname } from 'next/navigation';
import RodapeLinha from './RodapeLinha';

// Rodapé por página:
//   página principal (/)  -> rodapé completo (children: logo, redes, menu, endereço + linha final)
//   painel (/admin/*)     -> sem rodapé
//   todas as outras (cardápio, contato, legais, login, conta, pedido, 404) -> rodapé mínimo, só a linha final
export default function SemRodape({ children }: { children: React.ReactNode }) {
  const p = usePathname();
  if (p === '/') return children;
  if (p === '/admin' || p.startsWith('/admin/')) return null;
  return <footer className="rodape-min"><RodapeLinha /></footer>;
}
