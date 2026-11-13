// Busca de endereço por CEP no ViaCEP (usada no cardápio e no formulário de endereços da conta).
// Resposta de terceiro: nunca confiar. Cada campo é limpo e cortado; campo vazio na resposta não apaga o que o cliente digitou.
export type EnderecoCep = { rua: string; bairro: string; cidade: string; uf: string };
export type ResultadoCep = { ok: true; end: EnderecoCep } | { ok: false; motivo: 'invalido' | 'nao-encontrado' | 'falha' };

export const soDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 8);
export const mascaraCep = (v: string) => { const d = soDigitos(v); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

export const MSG_CEP = {
  buscando: 'Buscando endereço…',
  ok: 'Endereço encontrado. Confira e informe o número.',
  okSemBairro: 'Endereço encontrado, mas o CEP não informa o bairro. Preencha o bairro.',
  invalido: 'CEP inválido. Confira os 8 dígitos ou preencha o endereço abaixo.',
  'nao-encontrado': 'CEP não encontrado. Preencha o endereço abaixo.',
  falha: 'Não foi possível buscar o CEP agora. Preencha o endereço abaixo.',
} as const;

const texto = (v: unknown, max = 100) => (typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function buscarCep(cep: string): Promise<ResultadoCep> {
  const d = soDigitos(cep);
  if (!/^\d{8}$/.test(d) || /^(\d)\1{7}$/.test(d)) return { ok: false, motivo: 'invalido' }; // 00000000, 11111111…
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(7000) });
    if (r.status === 400) return { ok: false, motivo: 'invalido' };
    if (!r.ok) return { ok: false, motivo: 'falha' };
    const j = await r.json();
    if (!j || j.erro) return { ok: false, motivo: 'nao-encontrado' };
    // ViaCEP: logradouro / bairro / localidade (cidade) / uf
    return { ok: true, end: { rua: texto(j.logradouro, 120), bairro: texto(j.bairro), cidade: texto(j.localidade), uf: texto(j.uf, 2).toUpperCase() } };
  } catch {
    return { ok: false, motivo: 'falha' };
  }
}
