// Regras puras (lib/regras.ts). Node 24 roda TypeScript direto (remoção de tipos), sem build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proximos, podeIr, paraCentavos, doisDec, enderecoTexto, distanciaM, etaEstimada, aproximar } from '../../lib/regras.ts';

test('fluxo: Novo -> Em preparo -> Pronto, cancelar sempre que aberto', () => {
  assert.deepEqual(proximos('pending', 'pickup'), ['preparing', 'cancelled']);
  assert.deepEqual(proximos('confirmed', 'delivery'), ['preparing', 'cancelled']);
  assert.deepEqual(proximos('preparing', 'delivery'), ['ready', 'cancelled']);
  assert.ok(!podeIr('pending', 'ready', 'pickup'), 'não pula etapa');
  assert.ok(!podeIr('preparing', 'pending', 'pickup'), 'não volta');
});

test('fluxo: retirada fecha com Retirado; entrega nunca recebe Entregue pelo painel', () => {
  assert.deepEqual(proximos('ready', 'pickup'), ['delivered', 'cancelled']);
  assert.deepEqual(proximos('ready', 'delivery'), ['cancelled'], 'saída só pelo despacho');
  assert.ok(!podeIr('ready', 'out_for_delivery', 'delivery'));
  assert.ok(!podeIr('out_for_delivery', 'delivered', 'delivery'));
  assert.ok(!podeIr('ready', 'out_for_delivery', 'pickup'));
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

test('distância (haversine) e ETA de reserva', () => {
  const a = { lat: -23.5367, lng: -46.9342 };
  assert.equal(distanciaM(a, a), 0);
  const d = distanciaM(a, { lat: a.lat + 0.0002, lng: a.lng });
  assert.ok(d > 21 && d < 23, `~22 m, veio ${d}`);
  const e = etaEstimada(a, { lat: a.lat + 0.09, lng: a.lng }); // ~10 km em linha reta
  assert.ok(e.km > 13 && e.km < 15 && e.minutos > 30 && e.minutos < 36, JSON.stringify(e));
  assert.equal(etaEstimada(a, a).minutos, 1, 'mínimo de 1 min');
});

test('posição aproximada para o cliente (3 casas)', () => {
  assert.equal(aproximar(-23.54567), -23.546);
  assert.equal(aproximar(-46.94123), -46.941);
});
