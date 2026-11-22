// lib/geo.ts: reserva de geocodificação pela Routes API quando a Geocoding API recusa. fetch simulado, sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const raiz = pathToFileURL(process.cwd() + '/').href;
registerHooks({ resolve: (s, c, next) => next(s.startsWith('@/') ? raiz + s.slice(2) + '.ts' : s, c) });
process.env.GOOGLE_MAPS_SERVER_KEY = 'AIza' + 'x'.repeat(35);
const { geocodificar } = await import('../../lib/geo.ts');
console.error = () => {};

const end = { street: 'Rua A', number: '1', district: 'Centro', city: 'Itapevi', state: 'SP', zip_code: '06653-000' };
const json = (b, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => b });
const negado = json({ status: 'REQUEST_DENIED', error_message: 'billing' });
const rota = (tipo, parcial, lat = -23.5) => json({ routes: [{ legs: [{ endLocation: { latLng: { latitude: lat, longitude: -46.9 } } }] }], geocodingResults: { destination: { type: [tipo], partialMatch: parcial } } });
const com = (...respostas) => { const urls = []; globalThis.fetch = async (u) => { urls.push(String(u)); return respostas.shift(); }; return urls; };

test('Geocoding OK: usa o resultado e não chama a Routes', async () => {
  const urls = com(json({ status: 'OK', results: [{ geometry: { location: { lat: -23.1, lng: -46.1 }, location_type: 'ROOFTOP' } }] }));
  assert.deepEqual(await geocodificar(end), { lat: -23.1, lng: -46.1, aprox: false });
  assert.equal(urls.length, 1);
});

test('Geocoding recusado: endereço exato pela Routes API', async () => {
  const urls = com(negado, rota('street_address', false));
  assert.deepEqual(await geocodificar(end), { lat: -23.5, lng: -46.9, aprox: false });
  assert.match(urls[1], /routes\.googleapis\.com/);
});

test('Routes só acha o CEP: aceito como aproximado', async () => {
  com(negado, rota('postal_code', true));
  assert.equal((await geocodificar(end)).aprox, true);
});

test('Routes acha rua parecida (parcial, não é CEP): descarta e tenta só o CEP', async () => {
  const urls = com(negado, rota('route', true, -15.9), rota('postal_code', false, -23.54));
  const r = await geocodificar(end);
  assert.equal(r.lat, -23.54); assert.equal(r.aprox, true);
  assert.equal(urls.filter(u => u.includes('geocode/json')).length, 1); // não insiste na API recusada
});

test('nada encontrado: null (o painel mostra erro de endereço)', async () => {
  com(negado, rota('route', true), json({ error: { message: 'x' } }, false));
  assert.equal(await geocodificar(end), null);
});
