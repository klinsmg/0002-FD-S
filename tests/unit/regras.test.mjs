// Regras puras (lib/regras.ts). Node 24 roda TypeScript direto (remoção de tipos), sem build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proximos, podeIr, paraCentavos, doisDec, enderecoTexto } from '../../lib/regras.ts';

test('fluxo: Novo -> Em preparo -> Pronto, cancelar sempre que aberto', () => {
  assert.deepEqual(proximos('pending', 'pickup'), ['preparing', 'cancelled']);
  assert.deepEqual(proximos('confirmed', 'delivery'), ['preparing', 'cancelled']);
  assert.deepEqual(proximos('preparing', 'delivery'), ['ready', 'cancelled']);
  assert.ok(!podeIr('pending', 'ready', 'pickup'), 'não pula etapa');
  assert.ok(!podeIr('preparing', 'pending', 'pickup'), 'não volta');
});

test('fluxo: entrega Pronto -> Saiu para entrega -> Entregue; retirada Pronto -> Retirado', () => {
  assert.deepEqual(proximos('ready', 'pickup'), ['delivered', 'cancelled']);
  assert.deepEqual(proximos('ready', 'delivery'), ['out_for_delivery', 'cancelled']);
  assert.deepEqual(proximos('out_for_delivery', 'delivery'), ['delivered', 'cancelled']);
  assert.ok(!podeIr('ready', 'delivered', 'delivery'), 'entrega não pula a saída');
  assert.ok(!podeIr('ready', 'out_for_delivery', 'pickup'), 'retirada não sai para entrega');
  assert.ok(!podeIr('out_for_delivery', 'ready', 'delivery'), 'não volta');
});

test('fluxo: status finais não andam', () => {
  assert.deepEqual(proximos('delivered', 'pickup'), []);
  assert.deepEqual(proximos('cancelled', 'delivery'), []);
});

test('centavos: formatos brasileiros, vazio e inválido', () => {
  assert.equal(paraCentavos('12,50'), 1250);
  assert.equal(paraCentavos('1.234,50'), 123450);
  assert.equal(paraCentavos('R$ 8'), 800);
  assert.equal(paraCentavos('12.5'), 1250);
  assert.equal(paraCentavos(''), null);
  assert.equal(paraCentavos('abc'), undefined);
  assert.equal(paraCentavos('-1'), undefined);
  assert.equal(paraCentavos('10000,01', 1000000), undefined);
  assert.equal(doisDec(1250), '12,50');
  assert.equal(doisDec(null), '');
});

test('endereço em uma linha, tolerante a lixo', () => {
  assert.equal(enderecoTexto({ street: 'Rua A', number: '1', complement: 'ap 2', district: 'Centro', city: 'Itapevi', state: 'SP', reference: 'portão azul' }),
    'Rua A, 1 – ap 2 · Centro · Itapevi/SP · Ref.: portão azul');
  assert.equal(enderecoTexto(null), '');
  assert.equal(enderecoTexto('x'), '');
});

import { agruparHorarios } from '../../lib/regras.ts';
test('horários: junta dias seguidos iguais, como no site', () => {
  const h = (weekday, a, f, closed = false) => ({ weekday, opens_at: a, closes_at: f, closed });
  const atual = [h(0, '18:00:00', '01:00:00'), ...[1, 2, 3, 4, 5].map(d => h(d, '11:00:00', '01:00:00')), h(6, '18:00:00', '01:00:00')];
  assert.deepEqual(agruparHorarios(atual), [['Segunda a sexta', '11h às 01h'], ['Sábado e domingo', '18h às 01h']]);
  const comFolga = atual.map(x => x.weekday === 1 ? { ...x, closed: true } : x.weekday === 3 ? { ...x, opens_at: '11:30:00' } : x);
  assert.deepEqual(agruparHorarios(comFolga), [['Segunda', 'Fechado'], ['Terça', '11h às 01h'], ['Quarta', '11h30 às 01h'], ['Quinta e sexta', '11h às 01h'], ['Sábado e domingo', '18h às 01h']]);
  assert.deepEqual(agruparHorarios([]), []);
});

test('área Dev: só os e-mails da lista; lista vazia = todo admin (ninguém trancado fora)', async () => {
  const { ehDev } = await import('../../lib/regras.ts');
  assert.equal(ehDev('dev@x.com', ' Dev@X.com , outro@y.com'), true);
  assert.equal(ehDev('dono@loja.com', 'dev@x.com'), false);
  assert.equal(ehDev(null, 'dev@x.com'), false);
  assert.equal(ehDev('qualquer@a.com', ''), true);
  assert.equal(ehDev('qualquer@a.com', ' , '), true);
});

test('SEO: horário do banco vira OpeningHoursSpecification agrupado; fechado fica de fora', async () => {
  const { horariosSchema } = await import('../../lib/regras.ts');
  const h = (weekday, o, c, closed = false) => ({ weekday, opens_at: o, closes_at: c, closed });
  const r = horariosSchema([h(1, '11:00:00', '01:00:00'), h(2, '11:00:00', '01:00:00'), h(6, '18:00:00', '01:00:00'), h(0, '18:00:00', '01:00:00'), h(3, null, null, true)]);
  assert.deepEqual(r, [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday'], opens: '11:00', closes: '01:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '18:00', closes: '01:00' },
  ]);
});
