'use client';
import { useFormStatus } from 'react-dom';
import { entrarComGoogle } from '@/app/login/actions';

function Botao() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-p" disabled={pending}>{pending ? 'Abrindo o Google…' : 'Continuar com Google'}</button>;
}

// Login com Google (OAuth por redirecionamento, começado numa Server Action). Sem 2FA para clientes.
// Depois do login o Supabase volta em /auth/callback, que abre /conta.
export default function SocialLoginButtons({ falhou = false }: { falhou?: boolean }) {
  return (
    <form className="login-botoes" action={entrarComGoogle}>
      <Botao />
      <label className="conta-check"><input type="checkbox" name="manter" defaultChecked /> Manter conectado</label>
      <p className="nota">Em computador compartilhado, desmarque: você sai ao fechar o navegador.</p>
      {falhou && <p className="nota" role="alert">Não foi possível entrar. Tente novamente.</p>}
    </form>
  );
}
