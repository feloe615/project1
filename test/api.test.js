import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedDemo } from '../src/seed.js';
import { clientIp, createHttpServer } from '../src/server.js';

// Feste "Jetzt"-Zeit: Dienstag, 10.11.2026, 10:00 Uhr Berlin.
const NOW = new Date('2026-11-10T09:00:00Z');
const SLUG = 'trattoria-demo';
const KEY = 'test-admin-key';
let db, server, base;

const listen = async (srv) => {
  await new Promise((r) => srv.listen(0, r));
  return `http://127.0.0.1:${srv.address().port}`;
};

before(async () => {
  // Standard: eingebettetes PGlite. Mit TEST_DATABASE_URL läuft die Suite gegen einen echten
  // PostgreSQL-Server (Achtung: dessen Schema "public" wird dabei geleert).
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const tmp = await openDb(url);
    await tmp.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await tmp.close();
  }
  db = await openDb(url ?? 'memory://');
  await seedDemo(db, KEY);
  server = createHttpServer(db, { now: () => NOW, bookingRateLimit: { max: 1000, windowMs: 60_000 } });
  base = await listen(server);
});
after(async () => {
  server.close();
  await db.close();
});

const call = async (method, path, body, headers = {}) => {
  const res = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};
const admin = { Authorization: `Bearer ${KEY}` };
const book = (extra) => call('POST', `/api/restaurants/${SLUG}/reservations`, {
  date: '2026-11-11', time: '19:00', partySize: 2, name: 'Erika Muster', email: 'erika@example.com', ...extra,
});

test('Restaurant-Infos', async () => {
  const { status, body } = await call('GET', `/api/restaurants/${SLUG}`);
  assert.equal(status, 200);
  assert.equal(body.today, '2026-11-10');
  assert.equal(body.maxPartySize, 8);
  assert.equal(body.admin_key_hash, undefined);
});

test('Verfügbarkeit: Montag Ruhetag, Mittwoch offen', async () => {
  const mon = await call('GET', `/api/restaurants/${SLUG}/availability?date=2026-11-16&partySize=2`);
  assert.deepEqual(mon.body.slots, []);
  const wed = await call('GET', `/api/restaurants/${SLUG}/availability?date=2026-11-11&partySize=2`);
  assert.equal(wed.body.slots[0].time, '12:00');
  assert.ok(wed.body.slots.some((s) => s.time === '19:00' && s.available));
  const bad = await call('GET', `/api/restaurants/${SLUG}/availability?date=2026-02-30`);
  assert.equal(bad.status, 400);
});

test('Buchung, Abruf und Stornierung per Token', async () => {
  const { status, body } = await book();
  assert.equal(status, 201);
  assert.ok(body.token.length > 20);

  const got = await call('GET', `/api/reservations/${body.token}`);
  assert.equal(got.body.time, '19:00');
  assert.equal(got.body.status, 'confirmed');

  const del = await call('DELETE', `/api/reservations/${body.token}`);
  assert.equal(del.body.status, 'cancelled');
  assert.equal((await call('DELETE', `/api/reservations/${body.token}`)).status, 409);
});

test('keine Doppelbuchung: Zeitfenster ist voll, wenn alle passenden Tische belegt sind', async () => {
  const time = '20:00';
  for (let i = 0; i < 3; i++) assert.equal((await book({ time })).status, 201);
  // Für 1–2 Personen gibt es drei 2er-Tische; die 4er-Tische erlauben ebenfalls 2 Personen.
  for (let i = 0; i < 3; i++) assert.equal((await book({ time })).status, 201);
  const full = await book({ time });
  assert.equal(full.status, 409);
  const avail = await call('GET', `/api/restaurants/${SLUG}/availability?date=2026-11-11&partySize=2`);
  assert.equal(avail.body.slots.find((s) => s.time === time).available, false);
  // Eine 6er-Gruppe bekommt trotzdem noch den großen Tisch.
  assert.equal((await book({ time, partySize: 6 })).status, 201);
});

test('Validierung', async () => {
  assert.equal((await book({ email: 'kein-email' })).status, 400);
  assert.equal((await book({ name: '' })).status, 400);
  assert.equal((await book({ partySize: 12 })).status, 400);
  assert.equal((await book({ time: '19:07' })).status, 400); // kein gültiges Zeitfenster
  assert.equal((await book({ date: '2026-11-10', time: '10:30' })).status, 400); // zu kurzfristig/geschlossen
  assert.equal((await book({ website: 'http://spam' })).status, 400); // Honeypot
});

test('Verwaltung erfordert Schlüssel', async () => {
  assert.equal((await call('GET', `/api/admin/${SLUG}/reservations?date=2026-11-11`)).status, 401);
  const wrong = await call('GET', `/api/admin/${SLUG}/reservations`, null, { Authorization: 'Bearer falsch' });
  assert.equal(wrong.status, 401);
});

test('Verwaltung: Tagesliste und Statusänderung', async () => {
  const { body: res } = await book({ time: '18:00', name: 'Max Admin', notes: 'Fensterplatz' });
  const list = await call('GET', `/api/admin/${SLUG}/reservations?date=2026-11-11`, null, admin);
  assert.equal(list.status, 200);
  const row = list.body.reservations.find((r) => r.guest_name === 'Max Admin');
  assert.equal(row.time, '18:00');
  assert.equal(row.until, '19:30');
  assert.equal(row.notes, 'Fensterplatz');
  assert.ok(row.table_name);

  assert.equal((await call('PATCH', `/api/admin/${SLUG}/reservations/${row.id}`, { status: 'seated' }, admin)).status, 200);
  assert.equal((await call('GET', `/api/reservations/${res.token}`)).body.status, 'seated');
  // Platzierte Gäste können nicht mehr selbst stornieren.
  assert.equal((await call('DELETE', `/api/reservations/${res.token}`)).status, 409);
  assert.equal((await call('PATCH', `/api/admin/${SLUG}/reservations/${row.id}`, { status: 'egal' }, admin)).status, 400);
});

test('Sperrtage', async () => {
  assert.equal((await call('PUT', `/api/admin/${SLUG}/closures/2026-11-13`, { reason: 'Betriebsfeier' }, admin)).status, 200);
  const avail = await call('GET', `/api/restaurants/${SLUG}/availability?date=2026-11-13&partySize=2`);
  assert.deepEqual(avail.body.slots, []);
  const list = await call('GET', `/api/admin/${SLUG}/closures`, null, admin);
  assert.deepEqual(list.body, [{ date: '2026-11-13', reason: 'Betriebsfeier' }]);
  assert.equal((await call('DELETE', `/api/admin/${SLUG}/closures/2026-11-13`, null, admin)).status, 204);
  const again = await call('GET', `/api/restaurants/${SLUG}/availability?date=2026-11-13&partySize=2`);
  assert.ok(again.body.slots.length > 0);
});

test('statische Dateien und Pfad-Traversal', async () => {
  const widget = await fetch(`${base}/widget.js`);
  assert.equal(widget.status, 200);
  assert.equal(widget.headers.get('access-control-allow-origin'), '*');
  const trav = await fetch(`${base}/..%2Fsrc%2Fdb.js`);
  assert.equal(trav.status, 404);
});

test('Zustandsprüfung', async () => {
  assert.deepEqual((await call('GET', '/healthz')).body, { ok: true });
});

test('Client-IP hinter Reverse-Proxy', () => {
  const req = (xff) => ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: '10.0.0.1' } });
  assert.equal(clientIp(req('1.1.1.1, 2.2.2.2')), '10.0.0.1'); // ohne Proxy-Vertrauen: Header ignorieren
  assert.equal(clientIp(req('gefälscht, 2.2.2.2'), 1), '2.2.2.2');
  assert.equal(clientIp(req('1.1.1.1, 2.2.2.2'), 2), '1.1.1.1');
  assert.equal(clientIp(req(), 1), '10.0.0.1');
  assert.equal(clientIp(req('2.2.2.2'), 3), '10.0.0.1');
});

test('gleichzeitige Buchungen: nie mehr Reservierungen als Tische', async () => {
  // Für 7 Personen passt nur Tisch T8. Zehn parallele Anfragen → genau eine gewinnt.
  const results = await Promise.all(
    Array.from({ length: 10 }, () => book({ date: '2026-11-12', time: '19:00', partySize: 7 })));
  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [201, ...Array(9).fill(409)]);
});

test('Rate-Limit pro IP (über die Datenbank)', async () => {
  const limited = createHttpServer(db, { now: () => NOW, trustProxyHops: 1, bookingRateLimit: { max: 2, windowMs: 60_000 } });
  const url = await listen(limited);
  const attempt = (ip) => fetch(`${url}/api/restaurants/${SLUG}/reservations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ date: '2026-11-14', time: '12:00', partySize: 2, name: 'Limit Test', email: 'l@example.com' }),
  }).then((r) => r.status);
  try {
    assert.deepEqual([await attempt('203.0.113.9'), await attempt('203.0.113.9'), await attempt('203.0.113.9')], [201, 201, 429]);
    assert.equal(await attempt('203.0.113.10'), 201); // andere IP ist nicht betroffen
  } finally {
    limited.close();
  }
});
