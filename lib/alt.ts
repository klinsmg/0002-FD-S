// Textos alternativos (alt) de TODAS as imagens e a descrição dos vídeos: fonte única.
// As páginas leem daqui e o arquivo /alt.txt é gerado daqui. Trocou uma foto? Atualize o texto aqui.
import { info } from './info';

export const ALT = {
  logo: `Logotipo do ${info.nome}`,
  heroInicio: 'Hot dogs na tábua com queijo cheddar, bacon e batata palha, com anéis de cebola ao fundo',
  heroBurger: 'Clássico Insano: hambúrguer artesanal com bacon crocante, cheddar e cebola caramelizada',
  p07: 'Mãos de luvas pretas segurando dois hambúrgueres e uma garrafa de Coca-Cola',
  p09: 'Milk shakes de chocolate e frutas vermelhas',
  p10: 'Casal sorrindo e brindando com milk shakes de chocolate e morango',
  p12: 'Prato de refeição com carne, arroz e salada',
  p13: 'Mini hot dogs na tábua',
  p14: 'Mini lanches empilhados com espetinho',
  p15: 'Hot dog doce com confeitos coloridos',
  p16: 'Tábua com pastéis quadrados fritos, cobertos de carne desfiada, presunto e queijo',
  p18: 'Hambúrguer artesanal com bacon e queijo derretido',
  p19: 'Tábua com mini lanches e anéis de cebola',
  p20: 'Mesa de rodízio com mini lanches, porções e milk shake',
  p21: 'Hot dogs na tábua com cheddar e batata palha',
  p23: 'Petit gâteau com sorvete',
  p29: 'Mesa farta com hot dogs e mini lanches',
  p31: 'Porção de batata frita crocante na panelinha de alumínio',
  v05: 'Funcionário do Dogão acenando na cozinha',
  v10: 'Hambúrguer artesanal sendo cortado ao meio',
  v13: 'Brownie com sorvete e calda de chocolate',
} as const;

const img = (k: keyof typeof ALT): [string, string] => {
  const arq = k === 'logo' ? '/logo-dogao.webp' : k === 'heroInicio' ? '/img/hero-inicio.webp' : k === 'heroBurger' ? '/img/hero-burger.webp' : k.startsWith('v') ? `/video/${k}.mp4` : `/img/${k}.webp`;
  return [arq, ALT[k]];
};
export const arquivos = (Object.keys(ALT) as (keyof typeof ALT)[]).map(img);
