// Dados estruturados (schema.org, JSON-LD) para o Google e para as IAs (busca local, "perto de mim", respostas com cardápio).
// Tudo vem das mesmas fontes que a página mostra: lib/info.ts, lib/menu.ts e o horário do banco.
import { info, site } from '@/lib/info';
import { cats, variantes } from '@/lib/menu';
import { horariosSchema, type Horario } from '@/lib/regras';

const HORARIO_FIXO = horariosSchema([1, 2, 3, 4, 5].map(d => ({ weekday: d, opens_at: '11:00', closes_at: '01:00', closed: false }))
  .concat([6, 0].map(d => ({ weekday: d, opens_at: '18:00', closes_at: '01:00', closed: false }))));

const precos = cats.flatMap(c => c.grupos.filter(g => !g.info).flatMap(g => g.itens.flatMap(i => variantes(i).map(v => v.p)))).filter((p): p is number => p != null);
const faixa = precos.length ? `R$ ${Math.floor(Math.min(...precos))}–${Math.ceil(Math.max(...precos))}` : '$$';

export const restauranteLd = (linhas: Horario[] | null) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': ['Restaurant', 'FastFoodRestaurant'], '@id': `${site}/#restaurante`, name: info.nome, url: site,
      description: 'Lanchonete e hamburgueria em Itapevi-SP desde 1995: hambúrgueres artesanais, hot dog (dogão), pastéis, porções e rodízio. Pedido pelo site com entrega ou retirada.',
      image: [`${site}/img/p18.webp`, `${site}/img/hero-burger.webp`], logo: `${site}/logo-dogao.webp`,
      telephone: '+' + info.wa, email: info.email, priceRange: faixa, currenciesAccepted: 'BRL', paymentAccepted: 'Dinheiro, Pix, cartão de crédito, cartão de débito',
      servesCuisine: ['Hambúrguer', 'Hot dog', 'Lanches', 'Pastel', 'Porções', 'Brasileira'],
      address: { '@type': 'PostalAddress', streetAddress: info.rua, addressLocality: 'Itapevi', addressRegion: 'SP', postalCode: '06693-005', addressCountry: 'BR' },
      areaServed: { '@type': 'City', name: 'Itapevi' },
      hasMenu: `${site}/cardapio`, acceptsReservations: false, foundingDate: '1995', sameAs: [info.insta],
      openingHoursSpecification: (linhas && horariosSchema(linhas).length ? horariosSchema(linhas) : HORARIO_FIXO),
      potentialAction: { '@type': 'OrderAction', target: { '@type': 'EntryPoint', urlTemplate: `${site}/cardapio`, actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'] }, deliveryMethod: ['http://purl.org/goodrelations/v1#DeliveryModeOwnFleet', 'http://purl.org/goodrelations/v1#DeliveryModePickUp'] },
    },
    { '@type': 'WebSite', '@id': `${site}/#site`, url: site, name: info.nome, inLanguage: 'pt-BR', publisher: { '@id': `${site}/#restaurante` } },
  ],
});

// Cardápio completo (schema.org Menu): seções e itens com descrição e preço. Grupos só informativos ficam de fora.
export const cardapioLd = () => ({
  '@context': 'https://schema.org', '@type': 'Menu', '@id': `${site}/cardapio#menu`, name: `Cardápio ${info.nome}`, url: `${site}/cardapio`, inLanguage: 'pt-BR',
  hasMenuSection: cats.map(c => ({
    '@type': 'MenuSection', name: c.nome, description: c.desc,
    hasMenuItem: c.grupos.filter(g => !g.info).flatMap(g => g.itens).map(i => {
      const vs = variantes(i).filter(v => v.p != null);
      return {
        '@type': 'MenuItem', name: i.n, ...(i.d && { description: i.d }),
        ...(vs.length && { offers: vs.map(v => ({ '@type': 'Offer', price: v.p!.toFixed(2), priceCurrency: 'BRL', ...(v.l && { name: v.l }) })) }),
      };
    }),
  })),
});

export const json = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
