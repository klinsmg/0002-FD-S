import { redirect } from 'next/navigation';

// Endereços agora ficam em /conta/configuracoes; o endereço antigo continua funcionando.
export default function Enderecos() {
  redirect('/conta/configuracoes#enderecos');
}
