import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db.js';
import { seedDemo } from './seed.js';
import { createHttpServer } from './server.js';

const dbFile = process.env.DB_FILE ?? 'data/tischbuchung.db';
if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });
const db = openDb(dbFile);

if (!db.prepare('SELECT 1 FROM restaurants LIMIT 1').get()) {
  const { adminKey } = seedDemo(db, process.env.ADMIN_KEY);
  console.log('Demo-Restaurant "trattoria-demo" angelegt.');
  // Ein per Umgebungsvariable gesetzter Schlüssel gehört nicht ins Server-Protokoll.
  if (process.env.ADMIN_KEY) console.log('Admin-Schlüssel: aus der Umgebungsvariable ADMIN_KEY');
  else console.log(`Admin-Schlüssel: ${adminKey}  (bitte notieren – er wird nur gehasht gespeichert)`);
}

const port = Number(process.env.PORT ?? 3000);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
const server = createHttpServer(db, { trustProxyHops }).listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
  console.log(`  Demo-Website:   http://localhost:${port}/demo.html`);
  console.log(`  Verwaltung:     http://localhost:${port}/admin.html`);
});

// Sauber beenden, wenn die Plattform den Container stoppt (z. B. bei einem neuen Deployment).
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => { db.close(); process.exit(0); });
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
