// Esqueleto da área do cliente: aparece na hora ao trocar de seção e permite o prefetch das rotas do menu.
export default function Carregando() {
  return (
    <main aria-busy="true" aria-label="Carregando">
      <header className="pg-cab wrap">
        <p className="script">sua conta</p>
        <div className="skel skel-tit" />
      </header>
      <div className="wrap conta-caixa">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="skel skel-linha" />)}
      </div>
    </main>
  );
}
