'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Login com Google (OAuth por redirecionamento: funciona com a política COOP same-origin do site).
// Sem 2FA para clientes. Depois do login o Supabase volta em /auth/callback, que abre /conta.
export default function SocialLoginButtons({ falhou = false }: { falhou?: boolean }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(falhou);

  async function google() {
    setCarregando(true);
    setErro(false);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErro(true);
      setCarregando(false);
    }
  }

  return (
    <div className="login-botoes">
      <button type="button" className="btn btn-p" onClick={google} disabled={carregando}>
        {carregando ? 'Abrindo o Google…' : 'Continuar com Google'}
      </button>
      {erro && <p className="nota" role="alert">Não foi possível entrar. Tente novamente.</p>}
    </div>
  );
}
