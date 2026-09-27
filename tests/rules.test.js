import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, mergePlan, weatherFlags } from '../js/rules.js';
import { needsAdapter } from '../js/countries.js';

const base = {
  destination: { name: 'Madrid', countryCode: 'ES', lat: 40.4, lon: -3.7 },
  startDate: '2026-10-10',
  endDate: '2026-10-14',
  transport: ['train'],
  lodging: 'hotel',
  types: ['city'],
  travelers: { adults: 1, kids: 0, babies: 0, pets: 0 },
  options: {},
};
const keys = (plan) => plan.items.map((i) => i.key);
const taskKeys = (plan) => plan.tasks.map((t) => t.key);
const day = (tmax, tmin, extra = {}) => ({ date: '2026-10-10', tmax, tmin, precip: 0, code: 1, ...extra });

test('viaje nacional: DNI, sin pasaporte ni adaptador', () => {
  const p = buildPlan(base);
  assert.ok(keys(p).includes('id'));
  assert.ok(!keys(p).includes('passport'));
  assert.ok(!keys(p).includes('adapter'));
});

test('ropa según número de días y lavadora', () => {
  const p = buildPlan(base);
  assert.equal(p.items.find((i) => i.key === 'underwear').qty, 6);
  const long = buildPlan({ ...base, endDate: '2026-10-29', options: { laundry: true } });
  assert.equal(long.items.find((i) => i.key === 'underwear').qty, 8);
});

test('fuera de la UE: pasaporte, visado, seguro, adaptador y moneda', () => {
  const p = buildPlan({ ...base, destination: { name: 'Londres', countryCode: 'GB' }, transport: ['plane'] });
  for (const k of ['passport', 'insurance', 'adapter', 'currency', 'boarding']) assert.ok(keys(p).includes(k), k);
  for (const k of ['passport-check', 'visa', 'checkin', 'roaming']) assert.ok(taskKeys(p).includes(k), k);
});

test('Francia: DNI y tarjeta sanitaria europea, sin adaptador', () => {
  const p = buildPlan({ ...base, destination: { name: 'París', countryCode: 'FR' } });
  assert.ok(keys(p).includes('ehic'));
  assert.ok(!keys(p).includes('passport'));
  assert.ok(!keys(p).includes('adapter'));
  assert.ok(!keys(p).includes('currency'));
});

test('el tiempo añade paraguas, abrigo o bañador', () => {
  const rainy = buildPlan({ ...base, weather: { days: [day(15, 5, { precip: 8, code: 63 })] } });
  assert.ok(keys(rainy).includes('umbrella'));
  assert.ok(keys(rainy).includes('coat'));
  const hot = buildPlan({ ...base, weather: { days: [day(34, 22)] } });
  assert.ok(keys(hot).includes('shorts'));
  assert.ok(keys(hot).includes('sunscreen'));
  assert.ok(!keys(hot).includes('coat'));
});

test('solo equipaje de mano: regla de líquidos', () => {
  const p = buildPlan({ ...base, transport: ['plane'], options: { carryOnOnly: true } });
  assert.match(p.items.find((i) => i.key === 'toiletry-bag').text, /100 ml/);
});

test('bebés, niños y mascotas en coche', () => {
  const p = buildPlan({ ...base, transport: ['car'], travelers: { adults: 2, kids: 1, babies: 1, pets: 1 } });
  for (const k of ['diapers', 'car-seat', 'pet-food', 'license', 'v16']) assert.ok(keys(p).includes(k), k);
  assert.equal(p.items.find((i) => i.key === 'diapers').qty, 30);
});

test('mergePlan conserva marcados, cantidades, borrados y personalizados', () => {
  const trip = { ...base, hidden: ['book'], items: [], tasks: [] };
  let t = mergePlan(trip, buildPlan(trip));
  assert.ok(!t.items.some((i) => i.key === 'book'));
  t.items.find((i) => i.key === 'socks').done = true;
  Object.assign(t.items.find((i) => i.key === 'tshirts'), { qty: 2, qtyEdited: true });
  t.items.push({ key: 'c-1', cat: 'misc', text: 'Gafas', custom: true, done: false });
  t = mergePlan({ ...t, weather: { days: [day(20, 10, { precip: 5 })] } }, buildPlan({ ...t, weather: { days: [day(20, 10, { precip: 5 })] } }));
  assert.equal(t.items.find((i) => i.key === 'socks').done, true);
  assert.equal(t.items.find((i) => i.key === 'tshirts').qty, 2);
  assert.ok(t.items.some((i) => i.key === 'c-1'));
  assert.ok(t.items.some((i) => i.key === 'umbrella'));
});

test('weatherFlags', () => {
  assert.equal(weatherFlags(null), null);
  const f = weatherFlags({ days: [day(30, 20), day(10, -2, { code: 73 })] });
  assert.equal(f.hot, true);
  assert.equal(f.freezing, true);
  assert.equal(f.snow, true);
});

test('adaptador de enchufe', () => {
  assert.equal(needsAdapter('ES', 'FR'), false);
  assert.equal(needsAdapter('ES', 'CH'), false);
  assert.equal(needsAdapter('ES', 'GB'), true);
  assert.equal(needsAdapter('ES', 'US'), true);
  assert.equal(needsAdapter('ES', 'ZZ'), null);
});
