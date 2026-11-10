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
  console.log(`Admin-Schlüssel: ${adminKey}  (bitte notieren – er wird nur gehasht gespeichert)`);
}

const port = Number(process.env.PORT ?? 3000);
createHttpServer(db).listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
  console.log(`  Demo-Website:   http://localhost:${port}/demo.html`);
  console.log(`  Verwaltung:     http://localhost:${port}/admin.html`);
});
