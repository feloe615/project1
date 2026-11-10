// Lokaler Start (npm start). Auf Vercel wird stattdessen api/index.js verwendet.
import { mkdirSync } from 'node:fs';
import { openDb } from './db.js';
import { seedDemo } from './seed.js';
import { createHttpServer } from './server.js';

// Mit DATABASE_URL: echter PostgreSQL-Server. Ohne: eingebettetes PGlite im Ordner data/.
let url = process.env.DATABASE_URL;
if (!url) {
  url = process.env.DB_DIR ?? 'data/pgdata';
  if (!url.startsWith('memory://')) mkdirSync(url, { recursive: true });
}
const db = await openDb(url);
await seedDemo(db);

const port = Number(process.env.PORT ?? 3000);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
const server = createHttpServer(db, { trustProxyHops }).listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
  console.log(`  Demo-Website:   http://localhost:${port}/demo.html`);
  console.log(`  Verwaltung:     http://localhost:${port}/admin.html`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(async () => { await db.close().catch(() => {}); process.exit(0); });
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
