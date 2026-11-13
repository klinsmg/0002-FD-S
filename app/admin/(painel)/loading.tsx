// Esqueleto do painel: aparece na hora ao trocar de seção e permite ao Next pré-carregar (prefetch) as rotas do menu.
export default function Carregando() {
  return (
    <main aria-busy="true" aria-label="Carregando">
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <div className="skel skel-tit" />
      </header>
      <div className="wrap adm-caixa">
        <div className="adm-kpis">{[0, 1, 2].map(i => <div key={i} className="skel skel-kpi" />)}</div>
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skel skel-linha" />)}
      </div>
    </main>
  );
}
