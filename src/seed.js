import { createRestaurant } from './db.js';

const lunch = { first_seating: '12:00', last_seating: '14:00' };
const dinner = { first_seating: '17:30', last_seating: '21:30' };

/** Demo-Restaurant (fiktiv): Di–So Mittag + Abend, Montag Ruhetag. Liefert null, wenn es schon existiert. */
export function seedDemo(db, adminKey) {
  return createRestaurant(db, {
    slug: 'trattoria-demo',
    name: 'Trattoria Demo',
    timezone: 'Europe/Berlin',
    adminKey,
    hours: [0, 2, 3, 4, 5, 6].flatMap((weekday) => [
      { weekday, ...lunch },
      { weekday, ...dinner },
    ]),
    tables: [
      { name: 'T1', max_capacity: 2 },
      { name: 'T2', max_capacity: 2 },
      { name: 'T3', max_capacity: 2 },
      { name: 'T4', min_capacity: 2, max_capacity: 4 },
      { name: 'T5', min_capacity: 2, max_capacity: 4 },
      { name: 'T6', min_capacity: 2, max_capacity: 4 },
      { name: 'T7', min_capacity: 4, max_capacity: 6 },
      { name: 'T8', min_capacity: 5, max_capacity: 8 },
    ],
  });
}

/** Legt das Demo-Restaurant an, wenn die Datenbank noch leer ist. */
export async function seedIfEmpty(db, adminKey = process.env.ADMIN_KEY) {
  if ((await db.query('SELECT 1 FROM restaurants LIMIT 1')).length) return;
  const created = await seedDemo(db, adminKey);
  if (!created) return;
  console.log('Demo-Restaurant "trattoria-demo" angelegt.');
  // Ein per Umgebungsvariable gesetzter Schlüssel gehört nicht ins Server-Protokoll.
  if (adminKey) console.log('Admin-Schlüssel: aus der Umgebungsvariable ADMIN_KEY');
  else console.log(`Admin-Schlüssel: ${created.adminKey}  (bitte notieren – er wird nur gehasht gespeichert)`);
}
