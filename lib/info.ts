// Dados do cliente (fonte: pasta Clients/Marcio Dogão Itapevi). Mudou o telefone, endereço ou horário? É só aqui.
// Endereço público do site. Usado em sitemap, robots, llms.txt e metadados.
// SITE_URL (ex.: https://mdogao.com.br) quando o domínio próprio estiver ligado na Vercel; até lá, o endereço de produção
// da Vercel. Canonical, sitemap, robots e Open Graph apontam para cá: domínio que não abre derruba a indexação.
export const site = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://mdogao.vercel.app')).replace(/\/+$/, '');

export const info = {
  nome: 'MDogão Itapevi',
  fone: '(11) 97670-8155',
  wa: '5511976708155',
  email: 'marciodogaoitapevi@gmail.com',
  insta: 'https://www.instagram.com/mdogaoitapevi/',
  instaUser: '@mdogaoitapevi',
  rua: 'R. José Michelotti, 146',
  bairro: 'Cidade da Saúde, Itapevi - SP, 06693-005',
  horarios: [['Segunda a sexta', '11h às 01h'], ['Sábado e domingo', '18h às 01h']] as const,
};
export const wa = (msg = 'Olá! Vim pelo site do MDogão Itapevi.') => `https://wa.me/${info.wa}?text=${encodeURIComponent(msg)}`;
export const mapa = `https://www.google.com/maps?q=${encodeURIComponent(`${info.rua}, ${info.bairro}`)}`;

// Google (GOOGLE_MAPS_EMBED_KEY e GOOGLE_PLACE_ID em .env.local / Vercel). Lidas só no servidor (mapa e convite são montados
// no servidor). Validadas: só letras, números, _ e - (nada vai cru para a URL).
const env = (v?: string) => (v ?? '').trim();
const placeId = /^[A-Za-z0-9_-]{10,300}$/.test(env(process.env.GOOGLE_PLACE_ID)) ? env(process.env.GOOGLE_PLACE_ID) : '';
// Chave do Embed (pública, vai no HTML): GOOGLE_MAPS_EMBED_KEY. O nome antigo GOOGLE_MAPS_API_KEY só vale enquanto o
// Google do rastreamento estiver desligado: ligado, GOOGLE_MAPS_API_KEY é a chave SECRETA do servidor e nunca vai ao HTML.
const embed = env(process.env.GOOGLE_MAPS_EMBED_KEY) || (env(process.env.GOOGLE_MAPS_ENABLED) === 'true' ? '' : env(process.env.GOOGLE_MAPS_API_KEY));
const chaveMapa = /^[A-Za-z0-9_-]{20,100}$/.test(embed) ? embed : '';
// Link oficial para o cliente escrever a avaliação no Google (vazio sem Place ID: o botão não aparece)
export const avaliarNoGoogle = placeId ? `https://search.google.com/local/writereview?placeid=${placeId}` : '';
// Mapa: Maps Embed API com o Place ID (ou o endereço); sem chave, o mapa simples de antes
export const mapaEmbed = chaveMapa
  ? `https://www.google.com/maps/embed/v1/place?key=${chaveMapa}&q=${placeId ? `place_id:${placeId}` : encodeURIComponent(`${info.rua}, ${info.bairro}`)}&language=pt-BR`
  : `https://www.google.com/maps?q=${encodeURIComponent(`${info.rua}, ${info.bairro}`)}&output=embed`;
