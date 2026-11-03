// Texto para IAs (padrão llms.txt), gerado a partir dos mesmos dados do site: não precisa manter à mão.
import { cats, variantes } from './menu';
import { info, site } from './info';
import { arquivos } from './alt';

// Todos os rastreadores liberados, com as IAs permitidas nomeadas de forma explícita
// (ChatGPT/OpenAI, Claude/Anthropic, Gemini/Google, Perplexity e Grok/xAI: treino, busca e navegação sob pedido do usuário).
export const IAS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'Google-Extended', 'GoogleOther',
  'PerplexityBot', 'Perplexity-User',
  'GrokBot', 'xAI-Grok', 'Grok-DeepSearch',
];

const txt = { headers: { 'Content-Type': 'text/plain; charset=utf-8' } };
export const resposta = (corpo: string) => new Response(corpo, txt);

const horarios = info.horarios.map(([d, h]) => `${d}: ${h}`).join('; ');

export const llms = () => `# ${info.nome}

> Hamburgueria e restaurante em Itapevi-SP, desde 1995: lanches artesanais, hot dog, pastéis, porções, refeições, combos, rodízio de mini lanches e bebidas. Pedidos são feitos pelo cardápio do site e enviados por WhatsApp; o pagamento é combinado direto com a loja (o site não cobra nada).

- Endereço: ${info.rua}, ${info.bairro}
- Horários: ${horarios}
- Instagram: ${info.insta}
- E-mail: ${info.email}

## Páginas

- [Início](${site}/): apresentação, categorias, rodízio, vídeos e como chegar
- [Cardápio](${site}/cardapio): todos os itens e preços; monte o pedido e envie pelo WhatsApp
- [Contato](${site}/contato): formulário, canais de contato, horários e mapa
- [Política de privacidade](${site}/politica-de-privacidade)
- [Política de cookies](${site}/politica-de-cookies)
- [Termos de uso](${site}/termos-de-uso)

## Opcional

- [Cardápio completo em texto](${site}/llms-full.txt): todos os itens com descrição e preço
- [Textos alternativos das imagens](${site}/alt.txt): descrição de cada foto e vídeo do site
`;

export const llmsFull = () => {
  const L = [`# ${info.nome}: cardápio completo`, '', '> Cardápio de janeiro/2025; preços sujeitos a alteração. Itens sem preço: valor a confirmar com a loja pelo WhatsApp.', ''];
  for (const c of cats) {
    L.push(`## ${c.nome}`, '', c.desc, '');
    if (c.nota) L.push(c.nota, '');
    for (const g of c.grupos) {
      if (g.t) L.push(`### ${g.t}`, '');
      for (const i of g.itens) {
        const preco = g.info ? '' : variantes(i).map(v => `${v.l ? `${v.l} ` : ''}${v.t || 'valor a confirmar'}`).join(' · ');
        L.push(`- ${i.n}${preco ? ` — ${preco}` : ''}${i.d ? `: ${i.d}` : ''}`);
      }
      L.push('');
    }
  }
  return L.join('\n');
};

// ai.txt (mesmo formato do robots.txt): declara que as IAs listadas podem usar o conteúdo do site.
export const aiTxt = () => `# ai.txt — ${info.nome}
# Conteúdo do site liberado para IAs (treino, busca e navegação sob pedido do usuário).
# Sitemap: ${site}/sitemap.xml
# Resumo para IAs: ${site}/llms.txt

User-Agent: *
Allow: /

${IAS.map(a => `User-Agent: ${a}\nAllow: /`).join('\n\n')}
`;

// alt.txt: texto alternativo de cada imagem (e descrição de cada vídeo) do site, em formato simples.
export const altTxt = () => `# alt.txt — ${info.nome}
# Texto alternativo (alt) das imagens e descrição dos vídeos. Formato: endereço | texto
# Fonte: lib/alt.ts (as páginas usam exatamente os mesmos textos)

${arquivos.map(([arq, texto]) => `${site}${arq} | ${texto}`).join('\n')}
`;
