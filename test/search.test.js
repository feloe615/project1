import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedDemo, DEMO_RESTAURANTS } from '../src/seed.js';
import { createHttpServer } from '../src/server.js';
import { distanceKm, pickSlots, suggestDateTime } from '../src/search.js';

// Feste "Jetzt"-Zeit: Dienstag, 10.11.2026, 10:00 Uhr Berlin.
const NOW = new Date('2026-11-10T09:00:00Z');
const BERLIN = { lat: 52.52, lon: 13.405 };
const WED = '2026-11-11';
let db, server, base;

before(async () => {
  db = await openDb('memory://');
  await seedDemo(db, 'key');
  server = createHttpServer(db, { now: () => NOW, bookingRateLimit: { max: 1000, windowMs: 60_000 } });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await db.close();
});

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};
const search = (params) => get('/api/search?' + new URLSearchParams({
  date: WED, time: '19:00', partySize: 2, ...BERLIN, radiusKm: 10, ...params,
}));
const slugs = (r) => r.body.results.map((x) => x.slug);

test('distanceKm: Berlin–München etwa 504 km', () => {
  const d = distanceKm(52.52, 13.405, 48.137, 11.575);
  assert.ok(d > 495 && d < 515, String(d));
  assert.equal(distanceKm(1, 1, 1, 1), 0);
});

test('pickSlots: nächstgelegene freie Zeiten, chronologisch, mit Markierung der Wunschzeit', () => {
  const slots = ['17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00']
    .map((time) => ({ time, available: time !== '18:30' }));
  assert.deepEqual(pickSlots(slots, '19:00', { limit: 3 }), [
    { time: '18:00', exact: false }, { time: '19:00', exact: true }, { time: '19:30', exact: false },
  ]);
  assert.deepEqual(pickSlots(slots, '18:30', { limit: 2 }), [
    { time: '18:00', exact: false }, { time: '19:00', exact: false },
  ]);
  assert.deepEqual(pickSlots(slots, '12:00'), []); // nichts im Zeitfenster
});

test('suggestDateTime: heute Abend, sonst morgen', () => {
  const at = (h, m = 0) => suggestDateTime({ date: '2026-11-10', minutes: h * 60 + m });
  assert.deepEqual(at(10), { date: '2026-11-10', time: '19:00' });
  assert.deepEqual(at(18, 10), { date: '2026-11-10', time: '19:30' });
  assert.deepEqual(at(19, 45), { date: '2026-11-10', time: '21:00' });
  assert.deepEqual(at(20), { date: '2026-11-11', time: '19:00' });
  assert.deepEqual(at(23, 30), { date: '2026-11-11', time: '19:00' });
});

test('Meta: Städte mit Mittelpunkt und Küchen', async () => {
  const { body } = await get('/api/meta');
  assert.equal(body.today, '2026-11-10');
  assert.deepEqual(body.suggested, { date: '2026-11-10', time: '19:00' });
  assert.deepEqual(body.cities.map((c) => [c.city, c.restaurants]), [['Berlin', 6], ['München', 4]]);
  assert.ok(Math.abs(body.cities[0].lat - 52.5) < 0.1);
  assert.ok(body.cuisines.includes('Italienisch'));
});

test('Suche: nur Restaurants im Umkreis, mit freien Zeiten, nach Entfernung sortiert', async () => {
  const r = await search();
  assert.equal(r.status, 200);
  assert.equal(r.body.results.length, 6); // alle sechs Berliner, kein Münchner
  assert.ok(r.body.results.every((x) => x.city === 'Berlin' && x.slots.length > 0));
  const d = r.body.results.map((x) => x.distanceKm);
  assert.deepEqual(d, [...d].sort((a, b) => a - b));
  assert.equal(r.body.results[0].slug, 'trattoria-demo');
  assert.ok(r.body.results[0].slots.some((s) => s.time === '19:00' && s.exact));
  assert.equal(r.body.results[0].admin_key_hash, undefined);

  assert.deepEqual(slugs(await search({ radiusKm: 1 })), ['trattoria-demo']);
});

test('Suche: Filter für Küche, Preis, Bewertung und Sortierung nach Bewertung', async () => {
  assert.deepEqual(slugs(await search({ cuisine: 'Japanisch,Indisch' })).sort(), ['masala-demo', 'sakura-demo']);
  assert.deepEqual(slugs(await search({ maxPrice: 1 })), ['masala-demo']);
  const good = await search({ minRating: 4.5 });
  assert.deepEqual(slugs(good).sort(), ['bistro-demo', 'sakura-demo', 'trattoria-demo']);
  assert.deepEqual(slugs(await search({ sort: 'rating' })).slice(0, 2), ['bistro-demo', 'sakura-demo']);
});

test('Suche: Ruhetage, Gruppengröße und Wunschzeit', async () => {
  // Montag: Trattoria, Bistro und Taverna haben Ruhetag.
  const mon = slugs(await search({ date: '2026-11-16' })).sort();
  assert.deepEqual(mon, ['brauhaus-demo', 'masala-demo', 'sakura-demo']);
  // 10 Personen: nur das Brauhaus nimmt so große Gruppen.
  assert.deepEqual(slugs(await search({ partySize: 10 })), ['brauhaus-demo']);
  // 15:30 Uhr: Nur das durchgehend geöffnete Brauhaus hat genau diese Zeit. Restaurants mit
  // Mittagspause bieten höchstens ihre letzte Mittagszeit (14:00) als Ausweichzeit an.
  const afternoon = await search({ time: '15:30' });
  assert.equal(afternoon.body.results[0].slug, 'brauhaus-demo');
  assert.equal(afternoon.body.results[0].exact, true);
  const others = afternoon.body.results.slice(1);
  assert.ok(others.every((x) => !x.exact && x.slots.every((s) => s.time === '14:00')));
});

test('Suche: ausgebuchte Wunschzeit wird nicht als frei angeboten', async () => {
  // Sakura hat für zwei Personen vier passende Tische. Alle um 19:00 Uhr belegen.
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${base}/api/restaurants/sakura-demo/reservations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-11-12', time: '19:00', partySize: 2, name: 'Test Gast', email: 't@example.com' }),
    });
    assert.equal(res.status, 201);
  }
  const r = await search({ date: '2026-11-12', cuisine: 'Japanisch' });
  const sakura = r.body.results[0];
  assert.equal(sakura.exact, false);
  assert.ok(!sakura.slots.some((s) => s.time === '19:00'));
  assert.ok(sakura.slots.some((s) => s.time === '20:30')); // nach 90 Minuten wieder frei
  // Restaurants mit genau der Wunschzeit stehen vor solchen mit Ausweichzeiten.
  const all = await search({ date: '2026-11-12' });
  assert.equal(all.body.results.at(-1).slug, 'sakura-demo');
});

test('Suche: Eingabeprüfung', async () => {
  assert.equal((await search({ date: 'morgen' })).status, 400);
  assert.equal((await search({ time: '25:00' })).status, 400);
  assert.equal((await search({ lat: 123 })).status, 400);
  assert.equal((await get(`/api/search?date=${WED}&time=19:00`)).status, 400); // Standort fehlt
});

test('Demo-Daten: erneutes Anlegen ändert nichts, fehlende Profile werden ergänzt', async () => {
  await db.query("UPDATE restaurants SET lat = NULL, cuisine = NULL WHERE slug = 'pho-demo'");
  await seedDemo(db, 'anderer-key');
  const rows = await db.query('SELECT slug, cuisine, lat FROM restaurants ORDER BY slug');
  assert.equal(rows.length, DEMO_RESTAURANTS.length);
  assert.equal(rows.find((r) => r.slug === 'pho-demo').cuisine, 'Vietnamesisch');
});
