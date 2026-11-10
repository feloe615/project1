// Einstiegspunkt für Vercel: Alle Anfragen an /api/* und /healthz landen hier (siehe vercel.json).
// Die Dateien in public/ liefert Vercel selbst aus.
import { openDb } from '../src/db.js';
import { seedIfEmpty } from '../src/seed.js';
import { createApp } from '../src/server.js';

// Einmal pro Instanz: Datenbank verbinden, Schema anlegen, Demo-Restaurant anlegen.
let ready;
function init() {
  ready ??= (async () => {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DB_DIR;
    if (!url) throw new Error('DATABASE_URL ist nicht gesetzt (PostgreSQL-Verbindung, z. B. Neon)');
    const db = await openDb(url);
    await seedIfEmpty(db);
    // Vercel setzt X-Forwarded-For selbst auf die Adresse des Besuchers.
    return createApp(db, { trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1) });
  })();
  ready.catch(() => { ready = undefined; }); // beim nächsten Aufruf erneut versuchen
  return ready;
}

export default async function handler(req, res) {
  let app;
  try {
    app = await init();
  } catch (err) {
    console.error(err);
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'Dienst nicht verfügbar' }));
  }
  return app(req, res);
}
