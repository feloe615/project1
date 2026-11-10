import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots, findTable } from '../src/availability.js';

const restaurant = {
  slot_interval_min: 30, duration_min: 90, max_party_size: 8, booking_horizon_days: 30, min_notice_min: 60,
};
const hours = [{ weekday: 3, first_seating: '18:00', last_seating: '20:00' }]; // Mittwoch
const tables = [
  { id: 1, active: 1, min_capacity: 1, max_capacity: 2 },
  { id: 2, active: 1, min_capacity: 2, max_capacity: 4 },
];
const base = { restaurant, hours, tables, reservations: [], closed: false, partySize: 2, now: { date: '2026-11-10', minutes: 600 } };
const WED = '2026-11-11';

test('erzeugt Zeitfenster zwischen erster und letzter Ankunftszeit', () => {
  const slots = computeSlots({ ...base, date: WED });
  assert.deepEqual(slots.map((s) => s.time), ['18:00', '18:30', '19:00', '19:30', '20:00']);
  assert.ok(slots.every((s) => s.available));
});

test('geschlossene Tage, Ruhetage, Vergangenheit und Buchungshorizont', () => {
  assert.deepEqual(computeSlots({ ...base, date: WED, closed: true }), []);
  assert.deepEqual(computeSlots({ ...base, date: '2026-11-12' }), []); // Donnerstag ohne Öffnungszeiten
  assert.deepEqual(computeSlots({ ...base, date: '2026-11-04' }), []); // Vergangenheit
  assert.deepEqual(computeSlots({ ...base, date: '2027-01-06' }), []); // außerhalb Horizont
});

test('Vorlaufzeit am selben Tag', () => {
  const slots = computeSlots({ ...base, date: WED, now: { date: WED, minutes: 18 * 60 + 20 } });
  assert.deepEqual(slots.map((s) => s.time), ['19:30', '20:00']);
});

test('Vorlaufzeit über Mitternacht hinweg', () => {
  const r = { ...restaurant, min_notice_min: 24 * 60 };
  const slots = computeSlots({ ...base, restaurant: r, date: WED, now: { date: '2026-11-10', minutes: 19 * 60 } });
  assert.deepEqual(slots.map((s) => s.time), ['19:00', '19:30', '20:00']);
});

test('belegte Tische blockieren überlappende Zeitfenster', () => {
  const reservations = [
    { table_id: 1, start_min: 18 * 60, end_min: 19 * 60 + 30 },
    { table_id: 2, start_min: 18 * 60, end_min: 19 * 60 + 30 },
  ];
  const slots = computeSlots({ ...base, date: WED, reservations });
  assert.deepEqual(slots.filter((s) => !s.available).map((s) => s.time), ['18:00', '18:30', '19:00']);
});

test('findTable wählt den kleinsten passenden Tisch und beachtet Mindestbelegung', () => {
  assert.equal(findTable(tables, [], 2, 0, 90).id, 1);
  assert.equal(findTable(tables, [], 3, 0, 90).id, 2);
  assert.equal(findTable(tables, [], 5, 0, 90), null);
  assert.equal(findTable(tables, [{ table_id: 1, start_min: 0, end_min: 90 }], 2, 60, 150).id, 2);
  assert.equal(findTable(tables, [], 1, 0, 90).id, 1); // Tisch 2 erst ab 2 Personen
  assert.equal(findTable([{ ...tables[0], active: 0 }], [], 1, 0, 90), null);
});

test('Gruppen über der Maximalgröße erhalten keine Zeitfenster', () => {
  assert.deepEqual(computeSlots({ ...base, date: WED, partySize: 9 }), []);
});
