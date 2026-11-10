import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { ACTIVE_STATUSES, hashKey, newToken, transaction } from './db.js';
import { computeSlots, findTable } from './availability.js';
import { isValidDate, isValidTime, nowInTimeZone, toHHMM, toMin } from './time.js';

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

/** Einfaches In-Memory-Rate-Limit pro IP (für eine einzelne Instanz ausreichend). */
function rateLimiter({ max, windowMs }) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    return list.length <= max;
  };
}

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
  const allowBooking = rateLimiter(bookingRateLimit);

  const q = {
    restaurant: db.prepare('SELECT * FROM restaurants WHERE slug = ?'),
    hours: db.prepare('SELECT * FROM opening_hours WHERE restaurant_id = ?'),
    tables: db.prepare('SELECT * FROM tables WHERE restaurant_id = ?'),
    closure: db.prepare('SELECT reason FROM closures WHERE restaurant_id = ? AND date = ?'),
    activeRes: db.prepare(`SELECT table_id, start_min, end_min FROM reservations
      WHERE restaurant_id = ? AND date = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`),
    insertRes: db.prepare(`INSERT INTO reservations (restaurant_id, table_id, date, start_min, end_min,
      party_size, guest_name, guest_email, guest_phone, notes, token) VALUES (?,?,?,?,?,?,?,?,?,?,?)`),
    byToken: db.prepare(`SELECT r.*, x.name AS restaurant_name, x.slug AS restaurant_slug, x.timezone,
      x.min_notice_min FROM reservations r JOIN restaurants x ON x.id = r.restaurant_id WHERE r.token = ?`),
    setStatus: db.prepare('UPDATE reservations SET status = ? WHERE id = ? AND restaurant_id = ?'),
    dayList: db.prepare(`SELECT r.id, r.date, r.start_min, r.end_min, r.party_size, r.guest_name,
      r.guest_email, r.guest_phone, r.notes, r.status, r.created_at, t.name AS table_name
      FROM reservations r JOIN tables t ON t.id = r.table_id
      WHERE r.restaurant_id = ? AND r.date = ? ORDER BY r.start_min, r.id`),
    addClosure: db.prepare('INSERT OR REPLACE INTO closures (restaurant_id, date, reason) VALUES (?, ?, ?)'),
    delClosure: db.prepare('DELETE FROM closures WHERE restaurant_id = ? AND date = ?'),
    listClosures: db.prepare('SELECT date, reason FROM closures WHERE restaurant_id = ? AND date >= ? ORDER BY date'),
  };

  const getRestaurant = (slug) => {
    const r = q.restaurant.get(slug);
    if (!r) throw new HttpError(404, 'Restaurant nicht gefunden');
    return r;
  };

  const slotsFor = (r, date, partySize) => computeSlots({
    restaurant: r,
    hours: q.hours.all(r.id),
    tables: q.tables.all(r.id),
    reservations: q.activeRes.all(r.id, date, ...ACTIVE_STATUSES),
    closed: !!q.closure.get(r.id, date),
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
    ['GET', /^\/healthz$/, () => { db.prepare('SELECT 1').get(); return { ok: true }; }],

    ['GET', /^\/api\/restaurants\/([\w-]+)$/, ({ params: [slug] }) => {
      const r = getRestaurant(slug);
      const today = nowInTimeZone(r.timezone, now()).date;
      return {
        name: r.name, slug: r.slug, timezone: r.timezone, maxPartySize: r.max_party_size,
        bookingHorizonDays: r.booking_horizon_days, today,
      };
    }],

    ['GET', /^\/api\/restaurants\/([\w-]+)\/availability$/, ({ params: [slug], url }) => {
      const r = getRestaurant(slug);
      const date = url.searchParams.get('date');
      if (!isValidDate(date)) throw new HttpError(400, 'Ungültiges Datum (erwartet JJJJ-MM-TT)');
      const partySize = parseParty(url.searchParams.get('partySize') ?? '2', r);
      return { date, partySize, slots: slotsFor(r, date, partySize) };
    }],

    ['POST', /^\/api\/restaurants\/([\w-]+)\/reservations$/, async ({ params: [slug], req }) => {
      const r = getRestaurant(slug);
      if (!allowBooking(clientIp(req, trustProxyHops))) throw new HttpError(429, 'Zu viele Anfragen, bitte später erneut versuchen');
      const body = await readJson(req);
      if (body.website) throw new HttpError(400, 'Ungültige Anfrage'); // Honeypot-Feld gegen Bots

      const { date, time } = body;
      if (!isValidDate(date)) throw new HttpError(400, 'Ungültiges Datum');
      if (!isValidTime(time)) throw new HttpError(400, 'Ungültige Uhrzeit');
      const partySize = parseParty(body.partySize, r);
      const name = str(body.name, 100);
      const email = str(body.email, 200);
      const phone = str(body.phone, 40);
      const notes = str(body.notes, 500);
      if (name.length < 2) throw new HttpError(400, 'Bitte einen Namen angeben');
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Bitte eine gültige E-Mail-Adresse angeben');

      const reservation = transaction(db, () => {
        // Innerhalb der Transaktion erneut prüfen, damit zwei gleichzeitige Anfragen
        // nicht denselben Tisch bekommen.
        const slot = slotsFor(r, date, partySize).find((s) => s.time === time);
        if (!slot) throw new HttpError(400, 'Zu dieser Zeit ist keine Buchung möglich');
        const start = toMin(time);
        const end = start + r.duration_min;
        const table = findTable(q.tables.all(r.id), q.activeRes.all(r.id, date, ...ACTIVE_STATUSES), partySize, start, end);
        if (!table) throw new HttpError(409, 'Dieser Termin ist leider gerade vergeben worden');
        const token = newToken();
        q.insertRes.run(r.id, table.id, date, start, end, partySize, name, email, phone || null, notes || null, token);
        return { token, date, time, partySize, name, restaurant: { name: r.name, slug: r.slug }, status: 'confirmed' };
      });
      // Hier wäre der Ort für eine Bestätigungs-E-Mail (siehe README).
      return [201, reservation];
    }],

    ['GET', /^\/api\/reservations\/([\w-]+)$/, ({ params: [token] }) => {
      const row = q.byToken.get(token);
      if (!row) throw new HttpError(404, 'Reservierung nicht gefunden');
      return publicReservation(row);
    }],

    ['DELETE', /^\/api\/reservations\/([\w-]+)$/, ({ params: [token] }) => {
      const row = q.byToken.get(token);
      if (!row) throw new HttpError(404, 'Reservierung nicht gefunden');
      if (row.status !== 'confirmed') throw new HttpError(409, 'Diese Reservierung kann nicht mehr storniert werden');
      const local = nowInTimeZone(row.timezone, now());
      if (row.date < local.date || (row.date === local.date && row.start_min <= local.minutes)) {
        throw new HttpError(409, 'Vergangene Reservierungen können nicht storniert werden');
      }
      q.setStatus.run('cancelled', row.id, row.restaurant_id);
      return publicReservation({ ...row, status: 'cancelled' });
    }],

    // --- Verwaltung (Authorization: Bearer <Admin-Schlüssel>) ---------------------
    ['GET', /^\/api\/admin\/([\w-]+)\/reservations$/, ({ params: [slug], req, url }) => {
      const r = getRestaurant(slug);
      requireAdmin(req, r);
      const date = url.searchParams.get('date') ?? nowInTimeZone(r.timezone, now()).date;
      if (!isValidDate(date)) throw new HttpError(400, 'Ungültiges Datum');
      const reservations = q.dayList.all(r.id, date).map(({ start_min, end_min, ...x }) => ({
        ...x, time: toHHMM(start_min), until: toHHMM(end_min % 1440),
      }));
      const closure = q.closure.get(r.id, date);
      return { restaurant: r.name, date, closed: closure ? (closure.reason ?? true) : false, reservations };
    }],

    ['PATCH', /^\/api\/admin\/([\w-]+)\/reservations\/(\d+)$/, async ({ params: [slug, id], req }) => {
      const r = getRestaurant(slug);
      requireAdmin(req, r);
      const { status } = await readJson(req);
      if (!STAFF_STATUSES.includes(status)) throw new HttpError(400, 'Ungültiger Status');
      const { changes } = q.setStatus.run(status, Number(id), r.id);
      if (!changes) throw new HttpError(404, 'Reservierung nicht gefunden');
      return { id: Number(id), status };
    }],

    ['GET', /^\/api\/admin\/([\w-]+)\/closures$/, ({ params: [slug], req }) => {
      const r = getRestaurant(slug);
      requireAdmin(req, r);
      return q.listClosures.all(r.id, nowInTimeZone(r.timezone, now()).date);
    }],

    ['PUT', /^\/api\/admin\/([\w-]+)\/closures\/(\d{4}-\d{2}-\d{2})$/, async ({ params: [slug, date], req }) => {
      const r = getRestaurant(slug);
      requireAdmin(req, r);
      if (!isValidDate(date)) throw new HttpError(400, 'Ungültiges Datum');
      const { reason } = await readJson(req);
      q.addClosure.run(r.id, date, str(reason, 200) || null);
      return { date, reason: str(reason, 200) || null };
    }],

    ['DELETE', /^\/api\/admin\/([\w-]+)\/closures\/(\d{4}-\d{2}-\d{2})$/, ({ params: [slug, date], req }) => {
      const r = getRestaurant(slug);
      requireAdmin(req, r);
      q.delClosure.run(r.id, date);
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
