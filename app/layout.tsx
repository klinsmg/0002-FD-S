import type { Metadata, Viewport } from 'next';
import { Anton, Pacifico, Inter } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Lazy from '@/components/Lazy';
import { Analytics } from '@vercel/analytics/next';
import { info, site } from '@/lib/info';
import './tema.css';
import './globals.css';

const titulo = Anton({ weight: '400', subsets: ['latin'], variable: '--f-titulo', display: 'swap' });
const script = Pacifico({ weight: '400', subsets: ['latin'], variable: '--f-script', display: 'swap' });
const corpo = Inter({ subsets: ['latin'], variable: '--f-corpo', display: 'swap' });

const desc = 'Lanches artesanais, hot dog, pastéis, porções e rodízio em Itapevi. Desde 1995, para cada mordida uma experiência única.';
export const metadata: Metadata = {
  metadataBase: new URL(site),
  alternates: { canonical: './' },
  title: { default: 'Lanchonete e Hamburgueria em Itapevi - MDogão', template: '%s - MDogão' },
  description: desc,
  openGraph: { title: 'Lanchonete e Hamburgueria em Itapevi - MDogão', description: desc, locale: 'pt_BR', type: 'website', images: ['/img/p18.webp'] },
};
export const viewport: Viewport = { themeColor: '#130907' };

const ld = {
  '@context': 'https://schema.org', '@type': 'Restaurant', name: info.nome, telephone: '+' + info.wa, email: info.email,
  servesCuisine: ['Hambúrguer', 'Hot dog', 'Pastel', 'Porções'], sameAs: [info.insta], image: '/img/p18.webp',
  address: { '@type': 'PostalAddress', streetAddress: info.rua, addressLocality: 'Itapevi', addressRegion: 'SP', postalCode: '06693-005', addressCountry: 'BR' },
  openingHoursSpecification: [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '11:00', closes: '01:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '18:00', closes: '01:00' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${script.variable} ${corpo.variable}`}>
      <body>
        <a className="pular" href="#conteudo">Pular para o conteúdo</a>
        <Header />
        <div id="conteudo" tabIndex={-1}>{children}</div>
        <Footer />
        <Lazy />
        <Analytics />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      </body>
    </html>
  );
}
