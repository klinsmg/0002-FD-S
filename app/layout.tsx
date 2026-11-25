import type { Metadata, Viewport } from 'next';
import { Anton, Pacifico, Inter } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SemRodape from '@/components/SemRodape';
import Lazy from '@/components/Lazy';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { site } from '@/lib/info';
import { linhasHorario } from '@/lib/horarios';
import { json, restauranteLd } from '@/lib/seo';
import './tema.css';
import './globals.css';

const titulo = Anton({ weight: '400', subsets: ['latin'], variable: '--f-titulo', display: 'swap' });
const script = Pacifico({ weight: '400', subsets: ['latin'], variable: '--f-script', display: 'swap' });
const corpo = Inter({ subsets: ['latin'], variable: '--f-corpo', display: 'swap' });

const desc = 'Hamburgueria e lanchonete em Itapevi-SP desde 1995: hambúrguer artesanal, hot dog (dogão), pastéis, porções e rodízio. Peça pelo site com entrega ou retirada.';
// Google Search Console: GOOGLE_SITE_VERIFICATION = o código da tag "meta" (só o content)
const verificacao = /^[\w-]{10,100}$/.test(process.env.GOOGLE_SITE_VERIFICATION ?? '') ? process.env.GOOGLE_SITE_VERIFICATION : undefined;
export const metadata: Metadata = {
  metadataBase: new URL(site),
  alternates: { canonical: './' },
  title: { default: 'Lanchonete e Hamburgueria em Itapevi - MDogão', template: '%s - MDogão' },
  description: desc,
  applicationName: 'MDogão Itapevi',
  keywords: ['hamburgueria Itapevi', 'lanchonete Itapevi', 'hot dog Itapevi', 'dogão Itapevi', 'lanche delivery Itapevi', 'pastel Itapevi', 'porções Itapevi', 'rodízio de lanches'],
  openGraph: { title: 'Lanchonete e Hamburgueria em Itapevi - MDogão', description: desc, locale: 'pt_BR', type: 'website', siteName: 'MDogão Itapevi', url: './', images: [{ url: '/img/p18.webp', alt: 'Lanches do MDogão Itapevi' }] },
  twitter: { card: 'summary_large_image', title: 'Lanchonete e Hamburgueria em Itapevi - MDogão', description: desc, images: ['/img/p18.webp'] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  ...(verificacao && { verification: { google: verificacao } }),
};
export const viewport: Viewport = { themeColor: '#130907' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ld = restauranteLd(await linhasHorario());
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${script.variable} ${corpo.variable}`}>
      <body>
        <a className="pular" href="#conteudo">Pular para o conteúdo</a>
        <Header />
        <div id="conteudo" tabIndex={-1}>{children}</div>
        <SemRodape><Footer /></SemRodape>
        <Lazy />
        <Analytics />
        <SpeedInsights />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(ld) }} />
      </body>
    </html>
  );
}
