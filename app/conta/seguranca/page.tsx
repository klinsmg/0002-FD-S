import { redirect } from 'next/navigation';

// Segurança agora fica em /conta/configuracoes; o endereço antigo continua funcionando.
export default function Seguranca() {
  redirect('/conta/configuracoes#seguranca');
}
