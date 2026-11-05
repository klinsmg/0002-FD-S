import DefinirSenha from '@/components/DefinirSenha';

export const metadata = { title: 'Definir senha', robots: { index: false, follow: false } };

export default function AdminSenha() {
  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">área restrita</p>
        <h1>Definir <em>senha</em></h1>
      </header>
      <div className="wrap conta-caixa"><DefinirSenha /></div>
    </main>
  );
}
