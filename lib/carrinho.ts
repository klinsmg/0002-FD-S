// Carrinho do cardápio (Alpine.data). Serve só para o cliente ter noção de valores e montar o pedido:
// nada é cobrado aqui; o pedido segue como mensagem para o WhatsApp da loja, onde o pagamento é combinado.
type Extra = { n: string; p: number | null; q: number };
type Linha = { k: string; n: string; v: string; p: number | null; q: number; obs: string; ponto?: string; ex?: Extra[] };
type Cfg = { ids: string[]; paiDaSub: Record<string, string>; wa: string; molhos: { n: string; p: number | null; t: string }[] };

// Tira caracteres de controle e de inversão de texto (ex.: U+202E) de tudo que o cliente digita antes de montar a mensagem:
// evita texto enganoso ou "quebrado" na conversa do WhatsApp da loja.
const limpa = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const KEY = 'dogao-pedido';
const MAX_Q = 99;
const validaEx = (e: any): e is Extra =>
  !!e && typeof e.n === 'string' && e.n.length <= 40 && Number.isInteger(e.q) && e.q >= 1 && e.q <= 9 &&
  (e.p === null || (typeof e.p === 'number' && Number.isFinite(e.p) && e.p >= 0 && e.p < 1000));
const valida = (i: any): i is Linha =>
  !!i && typeof i.k === 'string' && typeof i.n === 'string' && typeof i.v === 'string' && typeof i.obs === 'string' &&
  (i.p === null || (typeof i.p === 'number' && Number.isFinite(i.p) && i.p >= 0 && i.p < 10000)) &&
  Number.isInteger(i.q) && i.q >= 1 && i.q <= MAX_Q &&
  (i.ponto === undefined || (typeof i.ponto === 'string' && i.ponto.length <= 20)) &&
  (i.ex === undefined || (Array.isArray(i.ex) && i.ex.length <= 12 && i.ex.every(validaEx)));

// --- busca inteligente: sem acento/hífen, palavras em qualquer ordem, plural/prefixo, pequenos erros de digitação e apelidos ---
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// plural -> singular simples (porções/porção, pastéis/pastel, hambúrgueres/hambúrguer)
const stem = (w: string) => (w.length < 4 ? w : /oes$|aes$/.test(w) ? `${w.slice(0, -3)}ao` : /eis$/.test(w) ? `${w.slice(0, -3)}el` : w.endsWith('s') ? w.slice(0, -1) : w);
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'e', 'a', 'o', 'no', 'na', 'um', 'uma', 'quero', 'por', 'favor']);
const APELIDOS: Record<string, string> = { cachorro: 'hot dog', cachorrinho: 'hot dog', hotdog: 'hot dog', hotdogs: 'hot dog', breja: 'cerveja', refri: 'refrigerante', hamburger: 'hamburguer', burger: 'burguer', burgers: 'burguer', xis: 'x', batatinha: 'batata', pastelzinho: 'pastel' };
const lev = (a: string, b: string, max: number) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};
const casa = (tok: string, words: string[]) => {
  const max = tok.length >= 8 ? 2 : tok.length >= 4 ? 1 : 0;
  return words.some(w => {
    if (tok.length < 3) return w.startsWith(tok);
    if (w.includes(tok) || (w.length >= 4 && tok.startsWith(w))) return true;
    if (!max) return false;
    return lev(tok, w, max) <= max || (tok.length >= 5 && w.length > tok.length && lev(tok, w.slice(0, tok.length), max) <= max);
  });
};
let qCache = '', qToks: string[] = [];
const tokens = (q: string) => {
  if (q !== qCache) {
    qCache = q;
    qToks = norm(q).replace('cachorro quente', 'hot dog').split(' ').filter(Boolean).flatMap(t => (APELIDOS[t] ?? t).split(' ')).filter(t => !PARADAS.has(t)).map(stem);
  }
  return qToks;
};
const tCache = new Map<string, string[]>();
const palavras = (t: string) => { let w = tCache.get(t); if (!w) { w = norm(t).split(' ').map(stem); tCache.set(t, w); } return w; };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function carrinho(cfg: Cfg): any {
  const c: any = {
    ...cfg,
    cat: 'all', sub: 'all', q: '', itens: [] as Linha[], opc: null as any, opcErro: '', ultimoEnvio: 0, open: false, passo: '', envioPendente: false, nomeTmp: '', nomeErro: '', endErro: '', cepMsg: '', salvos: [] as any[], salvoId: '', nome: '', tipo: 'retirada', tipoOk: false, a: { cep: '', rua: '', num: '', comp: '', bairro: '', cidade: '', uf: '' }, obs: '', erro: '', feito: false, abriu: null as Element | null,

    // --- filtro do cardápio ---
    n(s: string) { return s.normalize('NFD').replace(/[^a-z0-9 ]/gi, '').toLowerCase(); },
    ok(t: string) {
      const ts = tokens(this.q);
      if (!ts.length) return true;
      const w = palavras(t);
      return ts.every(k => casa(k, w));
    },
    // seção/subseção aparece se algum item dela combina com a busca (os textos ficam em data-t, no próprio item)
    secOk(el: Element) {
      if (!tokens(this.q).length) return true;
      return [...el.querySelectorAll<HTMLElement>('[data-t]')].some(e => this.ok(e.dataset.t || ''));
    },
    get achados() {
      if (!tokens(this.q).length) return 1;
      return [...document.querySelectorAll<HTMLElement>('.item[data-t]')].filter(e => this.ok(e.dataset.t || '')).length;
    },
    hash() {
      const h = location.hash.slice(1);
      if (this.ids.includes(h)) { this.cat = h; this.sub = 'all'; }
      else if (Object.prototype.hasOwnProperty.call(this.paiDaSub, h)) { this.cat = this.paiDaSub[h]; this.sub = h; }
    },

    // --- carrinho ---
    init() {
      this.hash();
      this.carregarSalvos();
      try {
        const d = JSON.parse(localStorage.getItem(KEY) || '{}');
        if (Array.isArray(d.itens)) this.itens = d.itens.filter(valida).slice(0, 60).map((i: Linha) => ({ k: i.k, n: i.n, v: i.v, p: i.p, q: i.q, obs: i.obs.slice(0, 240), ponto: i.ponto, ex: i.ex }));
        for (const f of ['nome', 'obs']) if (typeof d[f] === 'string') this[f] = d[f].slice(0, f === 'nome' ? 60 : 300);
        if (d.tipo === 'entrega' || d.tipo === 'retirada') this.tipo = d.tipo;
        this.tipoOk = d.tipoOk === true;
        if (d.a && typeof d.a === 'object') for (const k of Object.keys(this.a)) if (typeof d.a[k] === 'string') this.a[k] = d.a[k].slice(0, 100);
      } catch { /* sem localStorage: segue sem guardar */ }
      const salvar = () => {
        try { localStorage.setItem(KEY, JSON.stringify({ itens: this.itens, nome: this.nome, tipo: this.tipo, tipoOk: this.tipoOk, a: this.a, obs: this.obs })); } catch { /* ignora */ }
      };
      for (const f of ['itens', 'nome', 'tipo', 'tipoOk', 'a', 'obs']) this.$watch(f, salvar);
      // gaveta: trava a rolagem do fundo, leva o foco ao botão de fechar e devolve o foco a quem abriu
      this.$watch('opc', (v: unknown) => { document.body.style.overflow = v || this.open ? 'hidden' : ''; });
      this.$watch('open', (v: boolean) => {
        document.body.style.overflow = v || this.opc ? 'hidden' : '';
        if (v) { setTimeout(() => this.$refs.fechar?.focus(), 60); }
        else { const o = this.abriu; this.abriu = null; setTimeout(() => { if (o instanceof HTMLElement && o.getClientRects().length) o.focus(); }, 80); }
      });
    },
    // --- sequência de pop-ups: nome > retirar/entregar > endereço (só entrega) ---
    get endOk() { const a = this.a; return a.cep.replace(/\D/g, '').length === 8 && !!(a.rua.trim() && a.num.trim() && a.bairro.trim() && a.cidade.trim()); },
    faltando() {
      if (!this.nome.trim()) return 'nome';
      if (!this.tipoOk) return 'tipo';
      if (this.tipo === 'entrega' && !this.endOk) return 'end';
      return '';
    },
    mostra(p: string) {
      this.passo = p; this.nomeErro = ''; this.endErro = '';
      setTimeout(() => document.querySelector<HTMLElement>(`.nome-modal [data-foco="${p}"]`)?.focus(), 60);
    },
    // abre o pedido; antes, pede o que ainda falta. Os campos continuam editáveis dentro do pedido.
    avancar() {
      const p = this.faltando();
      if (p) { this.mostra(p); return; }
      this.passo = ''; this.open = true;
      if (this.envioPendente) { this.envioPendente = false; this.finalizar(); }
    },
    abrir(el?: Element) { this.abriu = el ?? null; this.nomeTmp = this.nome; this.avancar(); },
    confirmarNome() {
      const n = this.nomeTmp.trim();
      if (!n) { this.nomeErro = 'Digite o seu nome para continuar.'; return; }
      this.nome = n; this.avancar();
    },
    escolher(t: string) { this.tipo = t; this.tipoOk = true; this.avancar(); },
    voltarTipo() { this.mostra('tipo'); },
    confirmarEnd() {
      if (!this.endOk) { this.endErro = 'Preencha o CEP (8 dígitos), rua, número, bairro e cidade.'; return; }
      this.avancar();
    },
    fecharPasso() {
      this.passo = ''; this.envioPendente = false;
      const o = this.abriu; this.abriu = null;
      if (o instanceof HTMLElement && o.getClientRects().length) o.focus();
    },
    // CEP: máscara 00000-000 e preenchimento automático (ViaCEP)
    mascCep() {
      const d = this.a.cep.replace(/\D/g, '').slice(0, 8);
      this.a.cep = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
      if (d.length < 8) { this.cepMsg = ''; return; }
      this.buscarCep(d);
    },
    async buscarCep(d: string) {
      this.cepMsg = 'Buscando endereço…';
      const ainda = () => this.a.cep.replace(/\D/g, '') === d;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(7000) });
        if (!r.ok) throw new Error('http');
        const j = await r.json();
        if (!ainda()) return;
        if (!j || j.erro) { this.cepMsg = 'CEP não encontrado. Preencha o endereço abaixo.'; return; }
        const t = (v: unknown) => (typeof v === 'string' ? limpa(v).replace(/[<>]/g, '').slice(0, 100) : ''); // resposta de terceiro: nunca confiar
        this.a.rua = t(j.logradouro) || this.a.rua; this.a.bairro = t(j.bairro) || this.a.bairro;
        this.a.cidade = t(j.localidade) || this.a.cidade; this.a.uf = t(j.uf).slice(0, 2).toUpperCase() || this.a.uf;
        this.cepMsg = 'Endereço encontrado. Confira e informe o número.';
        setTimeout(() => document.querySelector<HTMLElement>(`${this.passo ? '.nome-modal' : '.dados'} [data-num]`)?.focus(), 60);
      } catch { if (ainda()) this.cepMsg = 'Não foi possível buscar o CEP agora. Preencha o endereço abaixo.'; }
    },
    get endLinhas(): string[] {
      const a = this.a, c = a.comp.trim();
      const L = [`${limpa(a.rua)}, ${limpa(a.num)}${c ? ` – ${limpa(c)}` : ''}`, `${limpa(a.bairro)} – ${limpa(a.cidade)}${limpa(a.uf) ? `/${limpa(a.uf)}` : ''}`];
      if (limpa(a.cep)) L.push(`CEP ${limpa(a.cep)}`);
      return L;
    },
    // mantém o Tab dentro da gaveta (ou do pop-up de nome) enquanto aberto
    trap(e: KeyboardEvent) {
      const r = this.opc ? '.opc-modal' : this.passo ? '.nome-modal' : '.gaveta';
      const f = [...document.querySelectorAll<HTMLElement>(`${r} button, ${r} input, ${r} textarea, ${r} summary`)].filter(x => x.getClientRects().length && !(x as HTMLInputElement).disabled);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    },
    // --- personalização (ponto da carne, molhos a mais, observações) ao adicionar itens que não são bebida ---
    pedir(k: string, n: string, v: string, p: number | null, el?: Element) {
      this.abriu = el ?? null;
      this.opcErro = '';
      this.opc = { k, n, v, p, ponto: '', ex: Object.fromEntries(this.molhos.map((m: any) => [m.n, 0])), sem: [] as string[], outro: '' };
      setTimeout(() => document.querySelector<HTMLElement>('.opc-modal [data-foco]')?.focus(), 60);
    },
    molho(nome: string, d: number) { if (this.opc) this.opc.ex[nome] = Math.max(0, Math.min(9, (this.opc.ex[nome] ?? 0) + d)); },
    alternaSem(t: string) { const s: string[] = this.opc.sem; const x = s.indexOf(t); if (x >= 0) s.splice(x, 1); else s.push(t); },
    get opcExtras(): Extra[] { return this.opc ? this.molhos.filter((m: any) => (this.opc.ex[m.n] ?? 0) > 0).map((m: any) => ({ n: m.n, p: m.p, q: this.opc.ex[m.n] })) : []; },
    get opcTotalTxt() {
      if (!this.opc) return '';
      if (this.opc.p == null) return 'valor a confirmar';
      const ex: Extra[] = this.opcExtras;
      return brl(this.opc.p + ex.reduce((t: number, e: Extra) => t + (e.p ?? 0) * e.q, 0)) + (ex.some((e: Extra) => e.p == null) ? ' + a confirmar' : '');
    },
    confirmarOpc() {
      const o = this.opc; if (!o) return;
      if (!o.ponto) { this.opcErro = 'Escolha o ponto da carne para continuar.'; document.querySelector<HTMLElement>('.opc-modal [data-foco]')?.focus(); return; }
      const ex: Extra[] = this.opcExtras;
      const obs = [...o.sem, o.outro.trim()].filter(Boolean).join(', ').slice(0, 240);
      const k = `${o.k}#${[o.ponto, ex.map(e => `${e.n}x${e.q}`).join('+'), obs].join('|')}`;
      const i = this.achar(k);
      if (i) { if (i.q < MAX_Q) i.q++; }
      else this.itens.push({ k, n: o.n, v: o.v, p: o.p, q: 1, obs, ponto: o.ponto || undefined, ex: ex.length ? ex : undefined });
      this.feito = false; this.opc = null;
      const el = this.abriu; this.abriu = null;
      setTimeout(() => { if (el instanceof HTMLElement && el.getClientRects().length) el.focus(); }, 80);
    },
    fecharOpc() { this.opc = null; const o = this.abriu; this.abriu = null; if (o instanceof HTMLElement && o.getClientRects().length) o.focus(); },
    qtdItem(k: string) { return this.itens.reduce((t: number, i: Linha) => t + (i.k === k || i.k.startsWith(`${k}#`) ? i.q : 0), 0); },
    unit(i: Linha) { return (i.p ?? 0) + (i.ex ?? []).reduce((t, e) => t + (e.p ?? 0) * e.q, 0); },
    pend(i: Linha) { return i.p == null || (i.ex ?? []).some(e => e.p == null); },
    resumo(i: Linha) { return [i.ponto, ...(i.ex ?? []).map(e => `+ ${e.q}x ${e.n}`)].filter(Boolean).join(' · '); },
    achar(k: string): Linha | undefined { return this.itens.find((i: Linha) => i.k === k); },
    qtd(k: string) { return this.achar(k)?.q ?? 0; },
    add(k: string, n: string, v: string, p: number | null) {
      const i = this.achar(k);
      if (i) { if (i.q < MAX_Q) i.q++; } else this.itens.push({ k, n, v, p, q: 1, obs: '' });
      this.feito = false;
    },
    dec(k: string) {
      const i = this.achar(k); if (!i) return;
      if (i.q > 1) i.q--; else this.del(k);
    },
    del(k: string) { this.itens = this.itens.filter((i: Linha) => i.k !== k); },
    limpar() { this.itens = []; this.obs = ''; this.erro = ''; this.feito = false; },
    get qtdTotal() { return this.itens.reduce((t: number, i: Linha) => t + i.q, 0); },
    get subtotal() { return this.itens.reduce((t: number, i: Linha) => t + this.unit(i) * i.q, 0); },
    get pendentes() { return this.itens.some((i: Linha) => this.pend(i)); },
    brl,
    get totalTxt() { return brl(this.subtotal) + (this.pendentes ? ' + itens a confirmar' : ''); },
    linha(i: Linha) { return i.p == null ? 'valor a confirmar' : brl(this.unit(i) * i.q) + ((i.ex ?? []).some(e => e.p == null) ? ' + a confirmar' : ''); },

    // --- endereços salvos da conta (só vêm se o cliente estiver logado; visitante recebe lista vazia) ---
    async carregarSalvos() {
      try {
        const r = await fetch('/api/enderecos', { credentials: 'same-origin', signal: AbortSignal.timeout(7000) });
        if (!r.ok) return;
        const j = await r.json();
        if (Array.isArray(j.enderecos)) this.salvos = j.enderecos.slice(0, 10);
      } catch { /* sem rede: segue sem endereços salvos */ }
    },
    usarSalvo() {
      const s = this.salvos.find((x: any) => x.id === this.salvoId); if (!s) return;
      const t = (v: unknown) => (typeof v === 'string' ? limpa(v).slice(0, 100) : '');
      const z = t(s.zip_code).replace(/\D/g, '').slice(0, 8);
      Object.assign(this.a, { cep: z.length > 5 ? `${z.slice(0, 5)}-${z.slice(5)}` : z, rua: t(s.street), num: t(s.number), comp: t(s.complement), bairro: t(s.district), cidade: t(s.city), uf: t(s.state).slice(0, 2).toUpperCase() });
      this.cepMsg = '';
    },
    // --- finalizar: monta o pedido e envia ao servidor (Server Action createOrder). Preços e totais são recalculados lá, no banco. ---
    finalizar() {
      this.erro = '';
      if (!this.itens.length) { this.erro = 'Adicione ao menos um item.'; return; }
      if (this.faltando()) { this.envioPendente = true; this.avancar(); return; }
      const agora = Date.now();
      if (agora - this.ultimoEnvio < 2500) return; // evita cliques repetidos
      const campo = document.getElementById('payload') as HTMLInputElement | null;
      const form = document.getElementById('form-pedido') as HTMLFormElement | null;
      if (!campo || !form) { this.erro = 'Não foi possível enviar agora. Recarregue a página.'; return; }
      this.ultimoEnvio = agora;
      const a = this.a;
      campo.value = JSON.stringify({
        nome: limpa(this.nome), tipo: this.tipo === 'entrega' ? 'delivery' : 'pickup', obs: limpa(this.obs),
        addr: this.tipo === 'entrega' ? { street: a.rua, number: a.num, complement: a.comp, district: a.bairro, city: a.cidade, state: a.uf, zip_code: a.cep } : null,
        itens: (this.itens as Linha[]).map(i => ({ cat: i.k.split('|')[0], nome: i.n, variante: i.v, qtd: i.q, ponto: i.ponto ?? null, obs: i.obs, extras: (i.ex ?? []).map(e => ({ nome: e.n, qtd: e.q })) })),
      });
      form.requestSubmit();
    },

    // --- mensagem do pedido (formato do WhatsApp: *negrito*, _itálico_) ---
    get mensagem() {
      const L: string[] = ['*Pedido – MDogão Itapevi*', ''];
      L.push(`*Cliente:* ${limpa(this.nome) || '(não informado)'}`);
      if (this.tipo === 'entrega') L.push('*Entrega:*', ...(this.endOk ? this.endLinhas : ['(endereço a combinar)'])); else L.push('*Retirada na loja*');
      L.push('', '*Itens*');
      for (const i of this.itens as Linha[]) {
        L.push(`${i.q}x ${i.v ? `${i.n} (${i.v})` : i.n} – ${this.linha(i)}`);
        if (i.ponto) L.push(`   ↳ Ponto da carne: ${limpa(i.ponto)}`);
        if (i.ex?.length) L.push(`   ↳ A mais: ${i.ex.map(e => `${e.q}x ${e.n} (${e.p == null ? 'valor a confirmar' : brl(e.p * e.q)})`).join(', ')}`);
        if (limpa(i.obs)) L.push(`   ↳ ${limpa(i.obs)}`);
      }
      L.push('', `*Total estimado:* ${this.totalTxt}`);
      if (limpa(this.obs)) L.push('', `*Observações:* ${limpa(this.obs)}`);
      L.push('', '_Pagamento combinado por aqui, pelo WhatsApp._');
      return L.join('\n');
    },
    enviar() {
      this.erro = '';
      if (!this.itens.length) { this.erro = 'Adicione ao menos um item.'; return; }
      if (this.faltando()) { this.envioPendente = true; this.avancar(); return; }
      const agora = Date.now();
      if (agora - this.ultimoEnvio < 2500) return; // evita cliques repetidos / envio em rajada
      const url = `https://wa.me/${this.wa}?text=${encodeURIComponent(this.mensagem)}`;
      if (url.length > 6000) { this.erro = 'Pedido muito grande para enviar de uma vez. Divida em dois pedidos.'; return; }
      this.ultimoEnvio = agora;
      window.open(url, '_blank', 'noopener,noreferrer');
      this.feito = true;
    },
  };
  return c;
}
