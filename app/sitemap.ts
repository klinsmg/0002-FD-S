import type { MetadataRoute } from 'next';
import { site } from '@/lib/info';

const hoje = new Date();
const paginas: [string, number, MetadataRoute.Sitemap[number]['changeFrequency']][] = [
  ['/', 1, 'weekly'],
  ['/cardapio', 0.9, 'weekly'],
  ['/contato', 0.7, 'monthly'],
  ['/politica-de-privacidade', 0.3, 'yearly'],
  ['/politica-de-cookies', 0.3, 'yearly'],
  ['/termos-de-uso', 0.3, 'yearly'],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return paginas.map(([rota, priority, changeFrequency]) => ({ url: `${site}${rota}`, lastModified: hoje, changeFrequency, priority }));
}
