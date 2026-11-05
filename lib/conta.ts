// Auxiliares da área do cliente (/conta): formatação e limpeza de texto. Sem acesso a banco.
export const STATUS: Record<string, string> = {
  pending: 'Recebido', confirmed: 'Confirmado', preparing: 'Em preparo', ready: 'Pronto',
  delivered: 'Entregue', cancelled: 'Cancelado',
};
export const PONTO: Record<string, string> = { rare: 'Mal passado', medium: 'Ao ponto', well_done: 'Bem passado' };
export const TIPO: Record<string, string> = { pickup: 'Retirada', delivery: 'Entrega' };

export const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const data = (d: string) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
export const cep = (z: string) => z.replace(/^(\d{5})(\d{3})$/, '$1-$2');

// Texto de formulário: tira caracteres de controle/invisíveis (inclui U+202E), junta espaços e limita o tamanho.
export const limpa = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Mensagens da página (vêm como ?erro=codigo; só códigos conhecidos são exibidos)
export const ERROS: Record<string, string> = {
  invalido: 'Confira os campos: CEP com 8 dígitos, UF com 2 letras e os campos obrigatórios preenchidos.',
  limite: 'Você já tem 10 endereços salvos. Remova um para adicionar outro.',
  falha: 'Não foi possível salvar agora. Tente novamente.',
  perfil: 'Confira o nome e o telefone (8 a 20 dígitos).',
};
