// Cardápio em texto, transcrito das páginas enviadas pelo cliente.
// Fonte: cardápio de janeiro/2025. Trocou o cardápio? Atualize os itens abaixo.
export type Item = { n: string; p?: string; d?: string };
export type Grupo = { t?: string; itens: Item[]; info?: boolean }; // info: só informação (regras, o que está incluso); não vira item de pedido
export type Cat = { id: string; nome: string; desc: string; grupos: Grupo[]; nota?: string };

// Variações de preço: "P R$ 15 · G R$ 35" -> [{l:'P',p:15,t:'R$ 15'},{l:'G',p:35,t:'R$ 35'}]. Sem preço: valor a confirmar.
export type Variante = { l: string; p: number | null; t: string };
export const variantes = (i: Item): Variante[] => {
  if (!i.p) return [{ l: '', p: null, t: '' }];
  const v = i.p.split(' · ').map(x => x.match(/^(.*?)\s*R\$\s*([\d.]+(?:,\d+)?)$/));
  if (v.some(m => !m)) return [{ l: '', p: null, t: i.p }];
  return v.map(m => ({ l: m![1].trim(), p: parseFloat(m![2].replace('.', '').replace(',', '.')), t: `R$ ${m![2]}` }));
};

export const adicionais: Item[] = [
  { n: 'Cheddar', p: 'R$ 10' }, { n: 'Catupiry', p: 'R$ 10' }, { n: 'Frango desfiado', p: 'R$ 12' }, { n: 'Carne desfiada', p: 'R$ 15' },
  { n: 'Calabresa', p: 'R$ 10' }, { n: 'Bacon', p: 'R$ 10' }, { n: 'Queijo', p: 'R$ 10' }, { n: 'Presunto', p: 'R$ 9' },
  { n: 'Burguer picanha', p: 'R$ 8' }, { n: 'Burguer artesanal', p: 'R$ 12' },
];
export const complemento: Item[] = [{ n: 'Batata-frita P', p: 'R$ 9,99' }, { n: 'Piscininha de cheddar', p: 'R$ 14,99' }];

// Personalização ao pedir (tudo exceto bebidas e adicionais): ponto da carne, condimentos/molhos a mais e remoções rápidas.
// Molhos sem preço no cardápio aparecem como "valor a confirmar"; ajuste o preço aqui quando o cliente informar.
export const PONTOS = ['Mal passado', 'Ao ponto', 'Bem passado'];
export const SEM = ['Sem cebola', 'Sem tomate', 'Sem alface', 'Sem molho', 'Sem maionese'];
export const molhos: Item[] = [
  { n: 'Cheddar', p: 'R$ 10' }, { n: 'Catupiry', p: 'R$ 10' }, { n: 'Catchup' }, { n: 'Maionese temperada' }, { n: 'Molho especial' }, { n: 'Barbecue' },
];

const picanha = (q: string) => `${q} hambúrguer${q === '01' ? '' : 'es'} 90g sabor picanha`;
const DOGAO_BASE = 'purê de batata, batata palha, milho, ervilha, vinagrete, catchup e maionese temperada';

export const cats: Cat[] = [
  {
    id: 'burguers-tradicionais', nome: 'Burguers Tradicionais', desc: 'Hambúrguer artesanal sabor picanha, com os adicionais que você quiser.',
    grupos: [{ itens: [
      { n: 'X-Burguer', p: 'R$ 23', d: `${picanha('01')}, queijo, molho especial, catchup, maionese temperada e orégano` },
      { n: 'X-Salada', p: 'R$ 28', d: `${picanha('01')}, queijo, alface, tomate, molho especial, catchup, maionese temperada e orégano` },
      { n: 'Ragonha', p: 'R$ 38', d: '01 hambúrguer, bacon, ovo, queijo, molho especial, catchup, maionese temperada e orégano' },
      { n: 'X-Bacon', p: 'R$ 35', d: '01 hambúrguer, bacon, queijo, alface, tomate, molho especial, catchup, maionese temperada e orégano' },
      { n: 'Double Burguer', p: 'R$ 35', d: `${picanha('02')}, queijo, molho especial, catchup, maionese temperada e orégano` },
      { n: 'Double Cheddar', p: 'R$ 35', d: `${picanha('02')}, cheddar, molho especial, catchup e maionese temperada` },
      { n: 'X-Podrão', p: 'R$ 45', d: '02 hambúrgueres, calabresa, presunto, bacon, 2 ovos, queijo, alface, tomate, molho especial, catchup, maionese temperada e orégano' },
      { n: 'Ostentação', p: 'R$ 49,99', d: '03 hambúrgueres, bacon, queijo, molho especial, catchup e maionese temperada' },
      { n: 'X-Laricão', p: 'R$ 139', d: `${picanha('04')}, filé de frango, molho especial, alface, tomate, queijo, presunto, bacon, calabresa, 04 ovos, cheddar, catupiry, catchup, maionese temperada e orégano` },
    ] }],
  },
  {
    id: 'burguers-classicos', nome: 'Burguers Clássicos', desc: 'Os clássicos da casa, do jeito que a gente faz desde 1995.',
    grupos: [{ itens: [
      { n: 'Clássico Burguer', p: 'R$ 35', d: 'Pão de brioche, 01 hambúrguer de carne 100% bovina 150g, queijo mussarela derretido, maionese da casa' },
      { n: 'Clássico Salada', p: 'R$ 35', d: 'Pão de brioche, 01 hambúrguer de carne 100% bovina 150g, queijo mussarela derretido, alface, tomate e cebola roxa, maionese da casa' },
      { n: 'Clássico Bacon Barbecue', p: 'R$ 40', d: 'Pão de brioche, 01 hambúrguer de carne 100% bovina 150g, bacon crocante, barbecue, queijo cheddar derretido, maionese da casa' },
      { n: 'Clássico Frango', p: 'R$ 40', d: 'Pão de brioche, frango empanado, queijo mussarela, catupiry, alface e tomate' },
      { n: 'Clássico Insano', p: 'R$ 50', d: 'Pão de brioche, 02 hambúrgueres de carne 100% bovina 150g, queijo cheddar, bacon crocante, cebola caramelizada, maionese da casa' },
    ] }],
  },
  {
    id: 'lanches-diversos', nome: 'Lanches Diversos', desc: 'Para quem quer variar: lanches de todos os jeitos.',
    grupos: [{ t: 'Todos no pão de 20 cm', itens: [
      { n: 'Desfiadão', p: 'R$ 35', d: `Carne desfiada, queijo, ${DOGAO_BASE}` },
      { n: 'X-Frango', p: 'R$ 35', d: 'Filé de frango, queijo, catupiry, orégano, alface, tomate, catchup e maionese temperada' },
      { n: 'Americano', p: 'R$ 35', d: 'Presunto, bacon, ovo, queijo, orégano, alface, tomate, catchup e maionese temperada' },
      { n: 'X-Calabresa', p: 'R$ 35', d: 'Calabresa, queijo, orégano, alface, tomate, catchup e maionese temperada' },
      { n: 'Galinhão', p: 'R$ 30', d: `Frango desfiado, catupiry, ${DOGAO_BASE}` },
    ] }],
  },
  {
    id: 'mini-lanches', nome: 'Mini Lanches', desc: 'Pequenos na medida, grandes no sabor. Ótimos para dividir.',
    grupos: [{ t: 'A partir de R$ 7,50 cada', itens: [{ n: 'Burguer' }, { n: 'Burguer doce' }, { n: 'Hotdog' }, { n: 'Hotdog doce' }] }],
  },
  {
    id: 'hot-dog', nome: 'Hot Dog', desc: 'O dogão que deu nome à casa.',
    grupos: [
      { t: 'Pão de 20 cm', itens: [
        { n: 'Dogão', p: 'R$ 27,50', d: `02 salsichas, ${DOGAO_BASE}` },
        { n: 'Calabresa e Bacon', p: 'R$ 35', d: `02 salsichas, calabresa, bacon, ${DOGAO_BASE}` },
        { n: 'Cheddar e Catupiry', p: 'R$ 35', d: `02 salsichas, cheddar, catupiry, ${DOGAO_BASE}` },
        { n: 'Dogão Loko', p: 'R$ 35', d: `02 salsichas, carne desfiada, ${DOGAO_BASE}` },
        { n: 'Dogão Especial', p: 'R$ 39', d: `02 salsichas, calabresa, bacon, queijo, orégano, ${DOGAO_BASE}` },
        { n: 'Dogão no Prato', p: 'R$ 60', d: `04 salsichas, calabresa, bacon, frango desfiado, cheddar, catupiry, alface, ${DOGAO_BASE}` },
      ] },
      { t: 'Pão de 15 cm', itens: [
        { n: 'Doguinho', p: 'R$ 15', d: '01 salsicha, purê de batata, batata palha, catchup e maionese temperada' },
        { n: 'Dog', p: 'R$ 20', d: '01 salsicha, purê de batata, batata palha, vinagrete, milho, ervilha, catchup e maionese temperada' },
      ] },
    ],
  },
  {
    id: 'pasteis', nome: 'Pastéis', desc: 'Pastéis sequinhos, doces e salgados.',
    grupos: [
      { t: 'Salgados', itens: [
        { n: 'Queijo', p: 'R$ 15' }, { n: 'Carne', p: 'R$ 15' }, { n: 'Calabresa', p: 'R$ 15' }, { n: 'Bauru', p: 'R$ 16' }, { n: 'Pizza', p: 'R$ 16' }, { n: 'Frango', p: 'R$ 16' },
        { n: 'Frango com catupiry', p: 'R$ 18' }, { n: 'Carne com queijo', p: 'R$ 18' }, { n: 'Calabresa com queijo', p: 'R$ 18' },
      ] },
      { t: 'Doces', info: true, itens: [{ n: 'Chocolate', p: 'R$ 16' }, { n: 'Chocolate com queijo', p: 'R$ 19' }, { n: 'Nutella', p: 'R$ 20' }, { n: 'Nutella com queijo', p: 'R$ 25' }] },
    ],
  },
  {
    id: 'porcoes', nome: 'Porções', desc: 'Para a mesa toda beliscar.',
    nota: 'P serve cerca de 3 pessoas; G, cerca de 5.',
    grupos: [
      { t: 'Entrada', itens: [{ n: 'Tábua Mini Waffles', p: 'R$ 25', d: 'Tamanho único' }] },
      { t: 'Batatas e anéis', itens: [
        { n: 'Batata frita simples', p: 'P R$ 15 · G R$ 35' },
        { n: 'Batata frita cheddar e bacon', p: 'P R$ 25 · G R$ 60' },
        { n: 'Onion ring', p: 'P R$ 15 · G R$ 25', d: 'Anéis de cebola empanados e fritos' },
      ] },
      { t: 'Carnes', itens: [
        { n: 'Calabresa', p: 'P R$ 60 · G R$ 95', d: 'Alface, tomate, pão tostado, cebola e batatas' },
        { n: 'Coxão mole', p: 'P R$ 75 · G R$ 120', d: 'Alface, tomate, pão tostado, cebola e batatas' },
        { n: 'Contra filé', p: 'P R$ 90 · G R$ 135', d: 'Alface, tomate, pão tostado, cebola e batatas' },
        { n: 'Da casa', p: 'P R$ 150 · G R$ 200', d: 'Coxão mole, calabresa, onion rings, bacia de cheddar, alface, tomate, pão tostado, cebolas e batata-frita' },
      ] },
    ],
  },
  {
    id: 'refeicoes', nome: 'Refeições', desc: 'Pratos que matam a fome de verdade.',
    nota: 'Valores do prato feito, do quilo e das marmitex (pequena, média e grande): consulte no WhatsApp.',
    grupos: [
      { t: 'Almoço · segunda a sábado, 11h às 16h', info: true, itens: [{ n: 'Por quilo' }, { n: 'À vontade' }, { n: 'Prato feito' }, { n: 'Feijoada às quartas e sábados' }] },
      { t: 'Jantar · segunda a sábado', info: true, itens: [{ n: 'Prato feito' }] },
      { t: 'Marmitex', itens: [
        'Omelete recheado', 'Frango ao molho', 'Filé de frango', 'Calabresa', 'Filé de frango à parmegiana', 'Bisteca', 'Calabresa acebolada', 'Linguiça',
        'Picadinho ou costela', 'Bife coxão mole', 'Bife a cavalo', 'Bife acebolado', 'Bife contra-filé', 'Bife à parmegiana',
      ].map(n => ({ n })) },
    ],
  },
  {
    id: 'combos', nome: 'Combos', desc: 'Lanche + acompanhamento pelo melhor preço.',
    grupos: [{ t: 'Monte o seu (lanche à escolha da promoção: X-Salada ou Dogão)', itens: [
      { n: 'Combo Solteiro', p: 'R$ 37,50', d: '1 X-Salada ou 1 Dogão, 1 batata-frita individual e 1 refrigerante lata 350 ml' },
      { n: 'Combo Casal', p: 'R$ 75', d: '2 lanches da promoção, 2 batatas-fritas individuais e 2 refrigerantes lata 350 ml' },
      { n: 'Combo Trio', p: 'R$ 105', d: '3 lanches da promoção, 3 batatas-fritas individuais e 3 refrigerantes lata 350 ml' },
      { n: 'Combo Família', p: 'R$ 160', d: '4 lanches da promoção, 1 batata-frita grande com cheddar e bacon e 1 Coca-Cola 2 litros' },
    ] }],
  },
  {
    id: 'combo-kids', nome: 'Combo Kids', desc: 'Feito para os pequenos.',
    grupos: [
      { t: 'Combo', itens: [{ n: 'Combo Kids', p: 'R$ 25', d: '01 Hamburguinho ou Doguinho, 01 refrigerante 200 ml ou suquinho, 01 batata-frita pequena e 01 bala Fini' }] },
      { t: 'Kids', itens: [
        { n: 'Burguinho', p: 'R$ 9,99', d: 'Lanche pequeno: hambúrguer e queijo' },
        { n: 'Doguinho', p: 'R$ 9,99', d: 'Lanche pequeno: salsicha, purê de batata, batata palha, catchup e maionese temperada' },
      ] },
      { t: 'Sobremesa', itens: [{ n: 'Bolo de pote', p: 'R$ 10' }, { n: 'Pudim no copo', p: 'R$ 15' }] },
    ],
  },
  {
    id: 'lanche-do-dia', nome: 'Lanche do Dia', desc: 'A sugestão especial da casa.',
    grupos: [{ itens: [
      { n: 'Domingo · X-Laricão', p: 'R$ 119', d: '04 hambúrgueres, filé de frango, molho especial, alface, tomate, queijo, presunto, bacon, calabresa, 04 ovos, cheddar, catupiry, catchup, maionese temperada e orégano' },
      { n: 'Segunda · Desfiadão', p: 'R$ 32,50', d: `Pão 20 cm, carne desfiada, queijo, ${DOGAO_BASE}` },
      { n: 'Terça · Galinhão', p: 'R$ 27,50', d: `Pão 20 cm, frango desfiado, catupiry, ${DOGAO_BASE}` },
      { n: 'Quarta · Dogão', p: 'R$ 24,50', d: `Pão 20 cm, 02 salsichas, ${DOGAO_BASE}` },
      { n: 'Quinta · X-Bacon', p: 'R$ 29,90', d: '01 hambúrguer, bacon, queijo, alface, tomate, molho especial, catchup, maionese temperada e orégano' },
      { n: 'Sexta · Dogão no Prato', p: 'R$ 49,90', d: `Pão 20 cm, 04 salsichas, calabresa, bacon, frango desfiado, cheddar, catupiry, alface, ${DOGAO_BASE}` },
      { n: 'Sábado · Ostentação', p: 'R$ 44,99', d: '03 hambúrgueres, bacon, queijo, molho especial, catchup e maionese temperada' },
    ] }],
  },
  {
    id: 'rodizio', nome: 'Rodízio', desc: 'Mini hot dogs e mini burguers à vontade, com entrada e acompanhamentos.',
    nota: 'Segunda a domingo, das 18h às 24h. Valores do rodízio e das bebidas: confirme no WhatsApp.',
    grupos: [
      { t: 'Incluso', info: true, itens: [{ n: '01 entrada de mini waffles' }, { n: '01 piscininha de cheddar' }, { n: 'Porção de anéis de cebola' }, { n: 'Porção de batata-frita' }] },
      { t: 'Mini hot dogs', info: true, itens: [{ n: 'Mini Dog' }, { n: 'Mini Dog Bacon' }, { n: 'Mini Dog Cheddar' }, { n: 'Mini Dog Catupiry' }] },
      { t: 'Mini burguers', info: true, itens: [{ n: 'Mini Burguer' }, { n: 'Mini Burguer Bacon' }, { n: 'Mini Burguer Cheddar' }, { n: 'Mini Burguer Salada' }, { n: 'Mini Burguer Onion' }, { n: 'Mini Burguer Caramelizado' }] },
      { t: 'Doces', info: true, itens: [{ n: 'Mini Hotdog Doce: chocolate ou chocolate com M&Ms' }, { n: 'Mini Burguer Doce: chocolate ou chocolate com M&Ms' }] },
      { t: 'Regras', info: true, itens: [
        { n: 'Desperdício', d: 'Caso haja, serão cobrados R$ 7,50 por lanche' },
        { n: 'Crianças', d: 'De 5 a 10 anos pagam meia e bebida à vontade por + R$ 7,50' },
        { n: 'Reservas', d: 'Tolerância de 15 minutos' },
      ] },
    ],
  },
  {
    id: 'adicionais', nome: 'Adicionais', desc: 'Turbine o seu lanche.', nota: 'Valem para burguers, lanches diversos, hot dogs e lanche do dia.',
    grupos: [{ itens: adicionais }, { t: 'Adicione ao seu pedido', itens: complemento }],
  },
  {
    id: 'bebidas', nome: 'Bebidas', desc: 'Para acompanhar o seu pedido.',
    grupos: [
      { t: 'Sem álcool', itens: [
        { n: 'Água', p: 'R$ 5' }, { n: 'Água com gás', p: 'R$ 6' }, { n: 'H2OH', p: 'R$ 9' }, { n: 'Dollynho', p: 'R$ 5' }, { n: 'Suco Ponchito', p: 'R$ 7' },
        { n: 'Soda italiana', p: 'R$ 15' }, { n: 'Suco natural (garrafa)', p: '500 ml R$ 12,50 · 1 L R$ 25' }, { n: 'Suco lata Del Valle', p: 'R$ 9' },
        { n: 'Refrigerante lata', p: 'R$ 9' }, { n: 'Coca-Cola KS', p: '290 ml R$ 8 · 1 L R$ 12' }, { n: 'Refrigerante 600 ml', p: 'R$ 13,50' },
        { n: 'Coca-Cola 1 L', p: 'R$ 15' }, { n: 'Tiss 2 L', p: 'R$ 13,50' }, { n: 'Dolly 2 L', p: 'R$ 14' }, { n: 'Sukita 2 L', p: 'R$ 15' }, { n: 'Coca-Cola 2 L', p: 'R$ 25' }, { n: 'Energético', p: 'R$ 15' },
      ] },
      { t: 'Cervejas (a partir de)', itens: [{ n: 'Cerveja lata', p: 'R$ 6', d: 'Valor a partir de: confirme a marca' }, { n: 'Cerveja long neck', p: 'R$ 12', d: 'Valor a partir de: confirme a marca' }, { n: 'Cerveja 600 ml', p: 'R$ 16', d: 'Valor a partir de: confirme a marca' }] },
    ],
  },
];

// Categorias com ícone (nível 1) e suas subcategorias (nível 2). Cada sub aponta para uma entrada de `cats`; [id, rótulo curto].
export type Pai = { id: string; nome: string; subs: [string, string][] };
export const pais: Pai[] = [
  { id: 'hamburgueres', nome: 'Hambúrgueres', subs: [['burguers-tradicionais', 'Tradicionais'], ['burguers-classicos', 'Clássicos'], ['lanches-diversos', 'Diversos'], ['mini-lanches', 'Mini lanches'], ['lanche-do-dia', 'Lanche do dia']] },
  { id: 'hot-dog', nome: 'Hot Dog', subs: [['hot-dog', 'Hot Dog']] },
  { id: 'pasteis', nome: 'Pastéis', subs: [['pasteis', 'Pastéis']] },
  { id: 'porcoes', nome: 'Porções', subs: [['porcoes', 'Porções']] },
  { id: 'refeicoes', nome: 'Refeições', subs: [['refeicoes', 'Refeições']] },
  { id: 'combos', nome: 'Combos', subs: [['combos', 'Combos'], ['combo-kids', 'Kids']] },
  { id: 'rodizio', nome: 'Rodízio', subs: [['rodizio', 'Rodízio']] },
  { id: 'adicionais', nome: 'Adicionais', subs: [['adicionais', 'Adicionais']] },
  { id: 'bebidas', nome: 'Bebidas', subs: [['bebidas', 'Bebidas']] },
];
