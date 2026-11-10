import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { ACTIVE_STATUSES, hashKey, newToken } from './db.js';
import { computeSlots, findTable } from './availability.js';
import { distanceKm, groupByRestaurant, pickSlots, suggestDateTime } from './search.js';
import { isValidDate, isValidTime, nowInTimeZone, toHHMM, toMin } from './time.js';

/** Nur Restaurants mit Standort und Freigabe erscheinen in der Suche. */
const SEARCHABLE = 'listed AND lat IS NOT NULL AND lon IS NOT NULL AND city IS NOT NULL';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const STAFF_STATUSES = ['confirmed', 'seated', 'completed', 'cancelled', 'no_show'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJson(req, limit = 10_000) {
  // Auf Vercel ist der Body bereits eingelesen und liegt (ggf. schon geparst) in req.body.
  let preParsed;
  try { preParsed = req.body; } catch { throw new HttpError(400, 'Ungültiges JSON'); }
  if (preParsed !== undefined) {
    if (Buffer.isBuffer(preParsed) || typeof preParsed === 'string') {
      try { return JSON.parse(preParsed.toString() || '{}'); } catch { throw new HttpError(400, 'Ungültiges JSON'); }
    }
    return preParsed ?? {};
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Anfrage zu groß');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new HttpError(400, 'Ungültiges JSON'); }
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * IP des Gastes. Hinter einem Reverse-Proxy (Hosting-Plattform) ist die Socket-Adresse die des
 * Proxys; dann zählt der Eintrag in X-Forwarded-For, den der äußerste vertrauenswürdige Proxy
 * angehängt hat (`trustProxyHops` von rechts). Einträge weiter links kann der Client fälschen.
 */
export function clientIp(req, trustProxyHops = 0) {
  if (trustProxyHops > 0) {
    const list = String(req.headers['x-forwarded-for'] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const ip = list[list.length - trustProxyHops];
    if (ip) return ip;
  }
  return req.socket.remoteAddress;
}

export function createApp(db, {
  now = () => new Date(),
  bookingRateLimit = { max: 10, windowMs: 10 * 60_000 },
  trustProxyHops = 0,
} = {}) {
  const ACTIVE = ACTIVE_STATUSES.map((x) => `'${x}'`).join(',');
  const one = async (c, sql, params) => (await c.query(sql, params))[0];

  /**
   * Rate-Limit pro IP über die Datenbank, damit es auch bei mehreren Server-Instanzen greift.
   * Gespeichert wird nur ein Hash der IP, und nur für die Dauer des Zeitfensters.
   */
  const allowBooking = async (ip) => {
    const ipHash = hashKey(String(ip));
    const secs = bookingRateLimit.windowMs / 1000;
    await db.query('DELETE FROM booking_attempts WHERE at < now() - make_interval(secs => $1)', [secs]);
    await db.query('INSERT INTO booking_attempts (ip_hash) VALUES ($1)', [ipHash]);
    const { n } = await one(db, 'SELECT count(*)::int AS n FROM booking_attempts WHERE ip_hash = $1', [ipHash]);
    return n <= bookingRateLimit.max;
  };

  const getRestaurant = async (slug, c = db) => {
    const r = await one(c, 'SELECT * FROM restaurants WHERE slug = $1', [slug]);
    if (!r) throw new HttpError(404, 'Restaurant nicht gefunden');
    return r;
  };

  const getTables = (c, r) => c.query('SELECT * FROM tables WHERE restaurant_id = $1', [r.id]);
  const getActive = (c, r, date) => c.query(
    `SELECT table_id, start_min, end_min FROM reservations
     WHERE restaurant_id = $1 AND date = $2 AND status IN (${ACTIVE})`, [r.id, date]);
  const getClosure = (c, r, date) =>
    one(c, 'SELECT reason FROM closures WHERE restaurant_id = $1 AND date = $2', [r.id, date]);
  const byToken = (token) => one(db,
    `SELECT r.*, x.name AS restaurant_name, x.slug AS restaurant_slug, x.timezone
     FROM reservations r JOIN restaurants x ON x.id = r.restaurant_id WHERE r.token = $1`, [token]);
  const setStatus = async (status, id, restaurantId) => (await db.query(
    'UPDATE reservations SET status = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING id',
    [status, id, restaurantId])).length > 0;

  const slotsFor = async (c, r, date, partySize) => computeSlots({
    restaurant: r,
    hours: await c.query('SELECT * FROM opening_hours WHERE restaurant_id = $1', [r.id]),
    tables: await getTables(c, r),
    reservations: await getActive(c, r, date),
    closed: !!(await getClosure(c, r, date)),
    date,
    partySize,
    now: nowInTimeZone(r.timezone, now()),
  });

  const parseParty = (v, r) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'Ungültige Personenzahl');
    if (n > r.max_party_size) {
      throw new HttpError(400, `Für Gruppen über ${r.max_party_size} Personen bitte telefonisch anfragen`);
    }
    return n;
  };

  const requireAdmin = (req, r) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    const given = Buffer.from(m ? hashKey(m[1]) : '', 'hex');
    const expected = Buffer.from(r.admin_key_hash, 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HttpError(401, 'Nicht autorisiert');
    }
  };

  const publicReservation = (row) => ({
    restaurant: { name: row.restaurant_name, slug: row.restaurant_slug },
    date: row.date,
    time: toHHMM(row.start_min),
    partySize: row.party_size,
    name: row.guest_name,
    status: row.status,
  });

  // --- Routen -----------------------------------------------------------------
  const routes = [
    // Für die Zustandsprüfung der Hosting-Plattform.
    ['GET', /^\/healthz$/, async () => { await db.query('SELECT 1'); return { ok: true }; }],

    ['GET', /^\/api\/restaurants\/([\w-]+)$/, async ({ params: [slug] }) => {
      const r = await getRestaurant(slug);
      const today = nowInTimeZone(r.timezone, now()).date;
      return {
        name: r.name, slug: r.slug, timezone: r.timezone, maxPartySize: r.max_party_size,
        bookingHorizonDays: r.booking_horizon_days, today,
      };
    }],

    ['GET', /^\/api\/restaurants\/([\w-]+)\/availability$/, async ({ params: [slug], url }) => {
      const r = await getRestaurant(slug);
      const date = url.searchParams.get('date');
      if (!isValidDate(date)) throw new HttpError(400, 'Ungültiges Datum (erwartet JJJJ-MM-TT)');
      const partySize = parseParty(url.searchParams.get('partySize') ?? '2', r);
      return { date, partySize, slots: await slotsFor(db, r, date, partySize) };
    }],

    // --- Suche über alle Restaurants ---------------------------------------------
    // Auswahlmöglichkeiten für das Suchformular: Städte (mit Mittelpunkt) und Küchen.
    ['GET', /^\/api\/meta$/, async () => {
      const cities = await db.query(`SELECT city, avg(lat) AS lat, avg(lon) AS lon, count(*)::int AS restaurants
        FROM restaurants WHERE ${SEARCHABLE} GROUP BY city ORDER BY count(*) DESC, city`);
      const cuisines = await db.query(
        `SELECT DISTINCT cuisine FROM restaurants WHERE ${SEARCHABLE} AND cuisine IS NOT NULL ORDER BY cuisine`);
      const local = nowInTimeZone('Europe/Berlin', now());
      return {
        today: local.date,
        suggested: suggestDateTime(local),
        cities,
        cuisines: cuisines.map((c) => c.cuisine),
      };
    }],

    // Restaurants, die zur Wunschzeit (oder kurz davor/danach) einen passenden Tisch frei haben.
    ['GET', /^\/api\/search$/, async ({ url }) => {
      const p = url.searchParams;
      const date = p.get('date');
      const time = p.get('time');
      if (!isValidDate(date)) throw new HttpError(400, 'Ungültiges Datum (erwartet JJJJ-MM-TT)');
      if (!isValidTime(time)) throw new HttpError(400, 'Ungültige Uhrzeit (erwartet HH:MM)');
      const partySize = Number(p.get('partySize') ?? 2);
      if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) throw new HttpError(400, 'Ungültige Personenzahl');

      const num = (key, min, max) => {
        if (!p.get(key)) return null;
        const n = Number(p.get(key));
        if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Ungültiger Wert für ${key}`);
        return n;
      };
      const lat = num('lat', -90, 90);
      const lon = num('lon', -180, 180);
      if (lat === null || lon === null) throw new HttpError(400, 'Standort fehlt (lat und lon)');
      const radiusKm = num('radiusKm', 0.1, 100) ?? 5;
      const maxPrice = num('maxPrice', 1, 4);
      const minRating = num('minRating', 1, 5);
      const cuisines = (p.get('cuisine') ?? '').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 20);
      const sort = p.get('sort') === 'rating' ? 'rating' : 'distance';

      // 1. Harte Kriterien in der Datenbank, Entfernung anschließend in JavaScript.
      const candidates = (await db.query(
        `SELECT * FROM restaurants WHERE ${SEARCHABLE}
           AND max_party_size >= $1
           AND ($2::int IS NULL OR price_level <= $2)
           AND ($3::real IS NULL OR rating >= $3)
           AND (cardinality($4::text[]) = 0 OR cuisine = ANY($4::text[]))`,
        [partySize, maxPrice, minRating, cuisines]))
        .map((r) => ({ ...r, distance: distanceKm(lat, lon, r.lat, r.lon) }))
        .filter((r) => r.distance <= radiusKm);
      if (!candidates.length) return { date, time, partySize, results: [] };

      // 2. Verfügbarkeit für alle Kandidaten mit vier Abfragen statt vier pro Restaurant.
      const ids = candidates.map((r) => r.id);
      const [hours, tables, reservations, closures] = await Promise.all([
        db.query('SELECT * FROM opening_hours WHERE restaurant_id = ANY($1::int[])', [ids]),
        db.query('SELECT * FROM tables WHERE restaurant_id = ANY($1::int[])', [ids]),
        db.query(`SELECT restaurant_id, table_id, start_min, end_min FROM reservations
          WHERE restaurant_id = ANY($1::int[]) AND date = $2 AND status IN (${ACTIVE})`, [ids, date]),
        db.query('SELECT restaurant_id FROM closures WHERE restaurant_id = ANY($1::int[]) AND date = $2', [ids, date]),
      ].map((q) => q.then(groupByRestaurant)));

      const results = candidates.map((r) => {
        const slots = pickSlots(computeSlots({
          restaurant: r,
          hours: hours.get(r.id) ?? [],
          tables: tables.get(r.id) ?? [],
          reservations: reservations.get(r.id) ?? [],
          closed: closures.has(r.id),
          date,
          partySize,
          now: nowInTimeZone(r.timezone, now()),
        }), time);
        return {
          slug: r.slug, name: r.name, description: r.description, cuisine: r.cuisine,
          priceLevel: r.price_level, rating: r.rating === null ? null : Math.round(r.rating * 10) / 10,
          ratingCount: r.rating_count, address: r.address, city: r.city,
          distanceKm: Math.round(r.distance * 10) / 10,
          exact: slots.some((s) => s.exact),
          slots,
        };
      }).filter((r) => r.slots.length);

      // Restaurants mit genau der Wunschzeit zuerst, danach nach Entfernung oder Bewertung.
      results.sort((a, b) => Number(b.exact) - Number(a.exact)
        || (sort === 'rating' ? (b.rating ?? 0) - (a.rating ?? 0) : 0)
        || a.distanceKm - b.distanceKm);
      return { date, time, partySize, results };
    }],

    ['POST', /^\/api\/restaurants\/([\w-]+)\/reservations$/, async ({ params: [slug], req }) => {
      const info = await getRestaurant(slug);
      if (!(await allowBooking(clientIp(req, trustProxyHops)))) {
        throw new HttpError(429, 'Zu viele Anfragen, bitte später erneut versuchen');
      }
      const body = await readJson(req);
      if (body.website) throw new HttpError(400, 'Ungültige Anfrage'); // Honeypot-Feld gegen Bots

      const { date, time } = body;
      if (!isValidDate(date)) throw new HttpError(400, 'Ungültiges Datum');
      if (!isValidTime(time)) throw new HttpError(400, 'Ungültige Uhrzeit');
      const partySize = parseParty(body.partySize, info);
      const name = str(body.name, 100);
      const email = str(body.email, 200);
      const phone = str(body.phone, 40);
      const notes = str(body.notes, 500);
      if (name.length < 2) throw new HttpError(400, 'Bitte einen Namen angeben');
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Bitte eine gültige E-Mail-Adresse angeben');

      const reservation = await db.tx(async (t) => {
        // Zeilensperre auf dem Restaurant: Gleichzeitige Buchungen desselben Restaurants laufen
        // nacheinander. So können zwei Anfragen nicht denselben Tisch bekommen.
        const r = await one(t, 'SELECT * FROM restaurants WHERE id = $1 FOR UPDATE', [info.id]);
        const slot = (await slotsFor(t, r, date, partySize)).find((s) => s.time === time);
        if (!slot) throw new HttpError(400, 'Zu dieser Zeit ist keine Buchung möglich');
        const start = toMin(time);
        const end = start + r.duration_min;
        const table = findTable(await getTables(t, r), await getActive(t, r, date), partySize, start, end);
        if (!table) throw new HttpError(409, 'Dieser Termin ist leider gerade vergeben worden');
        const token = newToken();
        await t.query(`INSERT INTO reservations (restaurant_id, table_id, date, start_min, end_min,
          party_size, guest_name, guest_email, guest_phone, notes, token)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [r.id, table.id, date, start, end, partySize, name, email, phone || null, notes || null, token]);
        return { token, date, time, partySize, name, restaurant: { name: r.name, slug: r.slug }, status: 'confirmed' };
      });
      // Hier wäre der Ort für eine Bestätigungs-E-Mail (siehe README).
      return [201, reservation];
    }],

    ['GET', /^\/api\/reservations\/([\w-]+)$/, async ({ params: [token] }) => {
      const row = await byToken(token);
      if (!row) throw new HttpError(404, 'Reservierung nicht gefunden');
      return publicReservation(row);
    }],

    ['DELETE', /^\/api\/reservations\/([\w-]+)$/, async ({ params: [token] }) => {
      const row = await byToken(token);
      if (!row) throw new HttpError(404, 'Reservierung nicht gefunden');
      if (row.status !== 'confirmed') throw new HttpError(409, 'Diese Reservierung kann nicht mehr storniert werden');
      const local = nowInTimeZone(row.timezone, now());
      if (row.date < local.date || (row.date === local.date && row.start_min <= local.minutes)) {
        throw new HttpError(409, 'Vergangene Reservierungen können nicht storniert werden');
      }
      await setStatus('cancelled', row.id, row.restaurant_id);
      return publicReservation({ ...row, status: 'cancelled' });
    }],

    // --- Verwaltung (Authorization: Bearer <Admin-Schlüssel>) ---------------------
    ['GET', /^\/api\/admin\/([\w-]+)\/reservations$/, async ({ params: [slug], req, url }) => {
      const r = await getRestaurant(slug);
      requireAdmin(req, r);
      const date = url.searchParams.get('date') ?? nowInTimeZone(r.timezone, now()).date;
      if (!isValidDate(date)) throw new HttpError(400, 'Ungültiges Datum');
      const rows = await db.query(`SELECT r.id, r.date, r.start_min, r.end_min, r.party_size, r.guest_name,
        r.guest_email, r.guest_phone, r.notes, r.status, r.created_at, t.name AS table_name
        FROM reservations r JOIN tables t ON t.id = r.table_id
        WHERE r.restaurant_id = $1 AND r.date = $2 ORDER BY r.start_min, r.id`, [r.id, date]);
      const reservations = rows.map(({ start_min, end_min, ...x }) => ({
        ...x, time: toHHMM(start_min), until: toHHMM(end_min % 1440),
      }));
      const closure = await getClosure(db, r, date);
      return { restaurant: r.name, date, closed: closure ? (closure.reason ?? true) : false, reservations };
    }],

    ['PATCH', /^\/api\/admin\/([\w-]+)\/reservations\/(\d+)$/, async ({ params: [slug, id], req }) => {
      const r = await getRestaurant(slug);
      requireAdmin(req, r);
      const { status } = await readJson(req);
      if (!STAFF_STATUSES.includes(status)) throw new HttpError(400, 'Ungültiger Status');
      if (!(await setStatus(status, Number(id), r.id))) throw new HttpError(404, 'Reservierung nicht gefunden');
      return { id: Number(id), status };
    }],

    ['GET', /^\/api\/admin\/([\w-]+)\/closures$/, async ({ params: [slug], req }) => {
      const r = await getRestaurant(slug);
      requireAdmin(req, r);
      return db.query('SELECT date, reason FROM closures WHERE restaurant_id = $1 AND date >= $2 ORDER BY date',
        [r.id, nowInTimeZone(r.timezone, now()).date]);
    }],

    ['PUT', /^\/api\/admin\/([\w-]+)\/closures\/(\d{4}-\d{2}-\d{2})$/, async ({ params: [slug, date], req }) => {
      const r = await getRestaurant(slug);
      requireAdmin(req, r);
      if (!isValidDate(date)) throw new HttpError(400, 'Ungültiges Datum');
      const reason = str((await readJson(req)).reason, 200) || null;
      await db.query(`INSERT INTO closures (restaurant_id, date, reason) VALUES ($1, $2, $3)
        ON CONFLICT (restaurant_id, date) DO UPDATE SET reason = EXCLUDED.reason`, [r.id, date, reason]);
      return { date, reason };
    }],

    ['DELETE', /^\/api\/admin\/([\w-]+)\/closures\/(\d{4}-\d{2}-\d{2})$/, async ({ params: [slug, date], req }) => {
      const r = await getRestaurant(slug);
      requireAdmin(req, r);
      await db.query('DELETE FROM closures WHERE restaurant_id = $1 AND date = $2', [r.id, date]);
      return [204, undefined];
    }],
  ];

  async function serveStatic(pathname, res) {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = normalize(join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR.endsWith(sep) ? PUBLIC_DIR : PUBLIC_DIR + sep)) return false;
    try {
      const data = await readFile(file);
      const headers = { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' };
      // widget.js wird von fremden Websites eingebunden.
      if (rel === 'widget.js') headers['Access-Control-Allow-Origin'] = '*';
      res.writeHead(200, headers);
      res.end(data);
      return true;
    } catch {
      return false;
    }
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const isPublicApi = url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/admin/');
    // Öffentliche API darf von jeder Restaurant-Website direkt aufgerufen werden.
    const cors = isPublicApi
      ? { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type' }
      : {};
    try {
      if (req.method === 'OPTIONS' && isPublicApi) return send(res, 204, undefined, cors);

      for (const [method, pattern, fn] of routes) {
        const m = pattern.exec(url.pathname);
        if (!m || method !== req.method) continue;
        const result = await fn({ params: m.slice(1), req, url });
        const [status, body] = Array.isArray(result) && typeof result[0] === 'number' ? result : [200, result];
        return send(res, status, body, cors);
      }
      if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'Nicht gefunden');
      if (req.method === 'GET' && (await serveStatic(url.pathname, res))) return;
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden');
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      const status = err instanceof HttpError ? err.status : 500;
      send(res, status, { error: err instanceof HttpError ? err.message : 'Interner Fehler', ...err.extra }, cors);
    }
  };
}

export const createHttpServer = (db, opts) => createServer(createApp(db, opts));
