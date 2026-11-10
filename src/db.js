// Datenbankschicht für PostgreSQL.
//
// - Produktion (z. B. Vercel + Neon): Verbindung über DATABASE_URL mit dem Treiber `pg`.
// - Lokal und in Tests: PGlite, ein eingebettetes PostgreSQL ohne Installation.
//
// Beide werden hinter derselben kleinen Schnittstelle versteckt:
//   db.query(sql, params) -> rows     db.exec(sql)     db.tx(async (t) => …)     db.close()
import { createHash, randomBytes } from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS restaurants (
  id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  min_capacity  INTEGER NOT NULL DEFAULT 1,
  max_capacity  INTEGER NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Sonderschließtage (Feiertage, Betriebsferien, geschlossene Gesellschaft …)
CREATE TABLE IF NOT EXISTS closures (
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,   -- 'JJJJ-MM-TT' in der Zeitzone des Restaurants
  reason        TEXT,
  PRIMARY KEY (restaurant_id, date)
);

CREATE TABLE IF NOT EXISTS reservations (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id      INTEGER NOT NULL REFERENCES tables(id),
  date          TEXT NOT NULL,   -- 'JJJJ-MM-TT' in der Zeitzone des Restaurants
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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_res_day ON reservations (restaurant_id, date);

-- Für das Rate-Limit: Buchungsversuche pro (gehashter) IP. Alte Zeilen werden laufend gelöscht.
CREATE TABLE IF NOT EXISTS booking_attempts (
  ip_hash TEXT NOT NULL,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts ON booking_attempts (ip_hash, at);
`;

/** Reservierungen in diesen Status blockieren einen Tisch. */
export const ACTIVE_STATUSES = ['confirmed', 'seated'];

export const hashKey = (key) => createHash('sha256').update(key).digest('hex');
export const newToken = () => randomBytes(18).toString('base64url');

async function pgAdapter(connectionString) {
  const { default: pg } = await import('pg');
  // Kleiner Pool: Auf Serverless-Plattformen laufen viele Instanzen parallel.
  const pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
  const wrap = (c) => ({
    query: async (sql, params) => (await c.query(sql, params)).rows,
    exec: async (sql) => { await c.query(sql); },
  });
  return {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function pgliteAdapter(dataDir) {
  // Der Paketname steht absichtlich in einer Variable: So packt der Vercel-Bundler das nur
  // lokal benötigte PGlite nicht in die Serverless-Funktion.
  const name = '@electric-sql/pglite';
  const { PGlite } = await import(name);
  const db = await PGlite.create(dataDir);
  const wrap = (c) => ({
    query: async (sql, params) => (await c.query(sql, params)).rows,
    exec: async (sql) => { await c.exec(sql); },
  });
  return {
    ...wrap(db),
    tx: (fn) => db.transaction((t) => fn(wrap(t))),
    close: () => db.close(),
  };
}

/**
 * Öffnet die Datenbank und legt bei Bedarf das Schema an.
 * `url`: postgres://… für einen echten Server, sonst ein PGlite-Verzeichnis ('memory://' = flüchtig).
 */
export async function openDb(url = 'memory://') {
  const db = /^postgres(ql)?:\/\//.test(url) ? await pgAdapter(url) : await pgliteAdapter(url);
  await db.tx(async (t) => {
    // Mehrere gleichzeitig startende Instanzen dürfen das Schema nicht parallel anlegen.
    await t.query('SELECT pg_advisory_xact_lock(7411001)');
    await t.exec(SCHEMA);
  });
  return db;
}

/**
 * Legt ein Restaurant samt Öffnungszeiten und Tischen an, sofern das Kürzel noch frei ist.
 * Gibt den Klartext-Admin-Schlüssel zurück (wird nur gehasht gespeichert) oder null,
 * wenn das Restaurant bereits existiert.
 */
export async function createRestaurant(db, { hours = [], tables = [], adminKey, ...r }) {
  const key = adminKey ?? randomBytes(24).toString('base64url');
  return db.tx(async (t) => {
    const [row] = await t.query(`
      INSERT INTO restaurants (slug, name, timezone, slot_interval_min, duration_min,
        max_party_size, booking_horizon_days, min_notice_min, admin_key_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (slug) DO NOTHING RETURNING id`, [
      r.slug, r.name, r.timezone ?? 'Europe/Berlin', r.slot_interval_min ?? 15, r.duration_min ?? 90,
      r.max_party_size ?? 8, r.booking_horizon_days ?? 60, r.min_notice_min ?? 60, hashKey(key),
    ]);
    if (!row) return null;
    for (const h of hours) {
      await t.query('INSERT INTO opening_hours VALUES ($1, $2, $3, $4)', [row.id, h.weekday, h.first_seating, h.last_seating]);
    }
    for (const x of tables) {
      await t.query('INSERT INTO tables (restaurant_id, name, min_capacity, max_capacity) VALUES ($1, $2, $3, $4)',
        [row.id, x.name, x.min_capacity ?? 1, x.max_capacity]);
    }
    return { id: row.id, adminKey: key };
  });
}
