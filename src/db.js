import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS restaurants (
  id                   INTEGER PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  timezone             TEXT NOT NULL DEFAULT 'Europe/Berlin',
  slot_interval_min    INTEGER NOT NULL DEFAULT 15,
  duration_min         INTEGER NOT NULL DEFAULT 90,   -- wie lange ein Tisch belegt ist
  max_party_size       INTEGER NOT NULL DEFAULT 8,    -- größere Gruppen: telefonisch
  booking_horizon_days INTEGER NOT NULL DEFAULT 60,
  min_notice_min       INTEGER NOT NULL DEFAULT 60,   -- Vorlaufzeit für Online-Buchungen
  admin_key_hash       TEXT NOT NULL
);

-- Mehrere Zeilen pro Wochentag möglich (z. B. Mittag + Abend).
CREATE TABLE IF NOT EXISTS opening_hours (
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  weekday       INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sonntag
  first_seating TEXT NOT NULL,   -- 'HH:MM'
  last_seating  TEXT NOT NULL    -- 'HH:MM', letzte buchbare Ankunftszeit
);

CREATE TABLE IF NOT EXISTS tables (
  id            INTEGER PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  min_capacity  INTEGER NOT NULL DEFAULT 1,
  max_capacity  INTEGER NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1
);

-- Sonderschließtage (Feiertage, Betriebsferien, geschlossene Gesellschaft …)
CREATE TABLE IF NOT EXISTS closures (
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  reason        TEXT,
  PRIMARY KEY (restaurant_id, date)
);

CREATE TABLE IF NOT EXISTS reservations (
  id            INTEGER PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id      INTEGER NOT NULL REFERENCES tables(id),
  date          TEXT NOT NULL,
  start_min     INTEGER NOT NULL,
  end_min       INTEGER NOT NULL,
  party_size    INTEGER NOT NULL,
  guest_name    TEXT NOT NULL,
  guest_email   TEXT NOT NULL,
  guest_phone   TEXT,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed','seated','completed','cancelled','no_show')),
  token         TEXT NOT NULL UNIQUE,  -- geheimer Link zum Verwalten/Stornieren
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_res_day ON reservations (restaurant_id, date);
`;

/** Reservierungen in diesen Status blockieren einen Tisch. */
export const ACTIVE_STATUSES = ['confirmed', 'seated'];

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

export const hashKey = (key) => createHash('sha256').update(key).digest('hex');
export const newToken = () => randomBytes(18).toString('base64url');

/** Führt fn in einer IMMEDIATE-Transaktion aus (verhindert Doppelbuchungen über Prozesse hinweg). */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Legt ein Restaurant samt Öffnungszeiten und Tischen an.
 * Gibt den Klartext-Admin-Schlüssel zurück (wird nur gehasht gespeichert).
 */
export function createRestaurant(db, { hours = [], tables = [], adminKey, ...r }) {
  const key = adminKey ?? randomBytes(24).toString('base64url');
  return transaction(db, () => {
    const { lastInsertRowid: id } = db.prepare(`
      INSERT INTO restaurants (slug, name, timezone, slot_interval_min, duration_min,
        max_party_size, booking_horizon_days, min_notice_min, admin_key_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      r.slug, r.name, r.timezone ?? 'Europe/Berlin', r.slot_interval_min ?? 15, r.duration_min ?? 90,
      r.max_party_size ?? 8, r.booking_horizon_days ?? 60, r.min_notice_min ?? 60, hashKey(key),
    );
    const insHour = db.prepare('INSERT INTO opening_hours VALUES (?, ?, ?, ?)');
    for (const h of hours) insHour.run(id, h.weekday, h.first_seating, h.last_seating);
    const insTable = db.prepare(
      'INSERT INTO tables (restaurant_id, name, min_capacity, max_capacity) VALUES (?, ?, ?, ?)');
    for (const t of tables) insTable.run(id, t.name, t.min_capacity ?? 1, t.max_capacity);
    return { id: Number(id), adminKey: key };
  });
}
