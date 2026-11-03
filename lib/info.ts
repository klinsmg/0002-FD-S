// Dados do cliente (fonte: pasta Clients/Marcio Dogão Itapevi). Mudou o telefone, endereço ou horário? É só aqui.
// Endereço público do site. Usado em sitemap, robots, llms.txt e metadados.
export const site = 'https://mdogao.com.br';

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
