'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// /admin/senha: (1) sem link de recuperação na URL -> pede o e-mail e envia o link; (2) com o link (hash #access_token ou ?code) -> define a nova senha.
export default function DefinirSenha() {
  const [fase, setFase] = useState<'carregando' | 'email' | 'senha' | 'enviado'>('carregando');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const code = new URLSearchParams(window.location.search).get('code');
      let ok = false;
      if (hash.get('access_token') && hash.get('refresh_token')) {
        ok = !(await supabase.auth.setSession({ access_token: hash.get('access_token')!, refresh_token: hash.get('refresh_token')! })).error;
      } else if (code) {
        ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
      }
      if (ok) history.replaceState(null, '', '/admin/senha'); // tira o token da barra de endereço
      else if (hash.get('access_token') || code) setErro('Link inválido ou expirado. Peça um novo.');
      setFase(ok ? 'senha' : 'email');
    })();
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setOcupado(true); setErro('');
    await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/admin/senha` });
    setOcupado(false); setFase('enviado'); // mesma resposta exista a conta ou não
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 12) { setErro('Use pelo menos 12 caracteres.'); return; }
    setOcupado(true); setErro('');
    const { error } = await createClient().auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) { setErro('Não foi possível salvar a senha. Peça um novo link.'); return; }
    window.location.assign('/admin'); // o guarda leva ao código 2FA ou à ativação
  }

  if (fase === 'carregando') return <p className="nota">Verificando…</p>;
  if (fase === 'enviado') return <p className="nota" role="status">Se o e-mail estiver cadastrado, enviamos um link para definir a senha.</p>;
  if (fase === 'senha') return (
    <form className="form" onSubmit={salvar}>
      {erro && <p className="nota" role="alert">{erro}</p>}
      <label htmlFor="n-senha">Nova senha (mín. 12 caracteres)</label>
      <input id="n-senha" type="password" autoComplete="new-password" minLength={12} maxLength={200} required value={senha} onChange={e => setSenha(e.target.value)} />
      <button className="btn btn-p" type="submit" disabled={ocupado}>Salvar senha</button>
    </form>
  );
  return (
    <form className="form" onSubmit={enviar}>
      {erro && <p className="nota" role="alert">{erro}</p>}
      <label htmlFor="n-email">E-mail do administrador</label>
      <input id="n-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
      <button className="btn btn-p" type="submit" disabled={ocupado}>Enviar link</button>
    </form>
  );
}
