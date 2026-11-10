import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

test('Vercel-Einstiegspunkt beantwortet API-Anfragen', async () => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  process.env.DB_DIR = 'memory://';
  process.env.ADMIN_KEY = 'vercel-test';
  const { default: handler } = await import('../api/index.js');
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { ok: true });
    const info = await (await fetch(`${base}/api/restaurants/trattoria-demo`)).json();
    assert.equal(info.name, 'Trattoria Demo');
    const admin = await fetch(`${base}/api/admin/trattoria-demo/reservations`, { headers: { Authorization: 'Bearer vercel-test' } });
    assert.equal(admin.status, 200);
  } finally {
    server.close();
  }
});
