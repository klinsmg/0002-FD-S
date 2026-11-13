// Esqueleto do pedido: abre na hora ao clicar num pedido do histórico (e permite o prefetch dos cards).
export default function Carregando() {
  return (
    <main aria-busy="true" aria-label="Carregando">
      <header className="pg-cab wrap">
        <p className="script">seu pedido</p>
        <div className="skel skel-tit" />
      </header>
      <div className="wrap conta-caixa">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="skel skel-linha" />)}
      </div>
    </main>
  );
}
