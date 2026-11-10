// Demo-Daten: frei erfundene Restaurants, damit Suche und Buchung ausprobiert werden können.
// Adressen, Bewertungen und Beschreibungen sind Platzhalter.
import { randomBytes } from 'node:crypto';
import { createRestaurant } from './db.js';

const lunch = { first_seating: '12:00', last_seating: '14:00' };
const dinner = { first_seating: '17:30', last_seating: '21:30' };
const late = { first_seating: '18:00', last_seating: '22:30' };
const allDay = { first_seating: '11:30', last_seating: '21:00' };

const days = (weekdays, ...periods) => weekdays.flatMap((weekday) => periods.map((p) => ({ weekday, ...p })));
const ALL = [0, 1, 2, 3, 4, 5, 6];
const NOT_MON = [0, 2, 3, 4, 5, 6];
const NOT_SUN = [1, 2, 3, 4, 5, 6];

const tables = (...sizes) => sizes.map(([min, max], i) => ({ name: 'T' + (i + 1), min_capacity: min, max_capacity: max }));
const SMALL = tables([1, 2], [1, 2], [2, 4], [2, 4]);
const MEDIUM = tables([1, 2], [1, 2], [1, 2], [2, 4], [2, 4], [2, 4], [4, 6], [5, 8]);
const LARGE = tables([1, 2], [1, 2], [1, 2], [1, 2], [2, 4], [2, 4], [2, 4], [2, 4], [4, 6], [4, 6], [5, 8], [6, 10]);

export const DEMO_RESTAURANTS = [
  { slug: 'trattoria-demo', name: 'Trattoria Demo', cuisine: 'Italienisch', price_level: 2, rating: 4.6, rating_count: 212,
    city: 'Berlin', address: 'Musterstraße 12, 10178 Berlin', lat: 52.5225, lon: 13.4020,
    description: 'Hausgemachte Pasta und Holzofenpizza in gemütlicher Atmosphäre.',
    hours: days(NOT_MON, lunch, dinner), tables: MEDIUM },
  { slug: 'sakura-demo', name: 'Sakura Demo', cuisine: 'Japanisch', price_level: 3, rating: 4.7, rating_count: 148,
    city: 'Berlin', address: 'Beispielallee 5, 10405 Berlin', lat: 52.5380, lon: 13.4200,
    description: 'Sushi und Ramen, ruhig und elegant. Gut für einen Abend zu zweit.',
    hours: days(NOT_SUN, late), tables: SMALL },
  { slug: 'brauhaus-demo', name: 'Brauhaus Demo', cuisine: 'Deutsch', price_level: 2, rating: 4.2, rating_count: 530,
    city: 'Berlin', address: 'Probeweg 30, 10963 Berlin', lat: 52.4990, lon: 13.3880, max_party_size: 10,
    description: 'Deftige Küche und eigenes Bier. Lebhaft, ideal für größere Gruppen.',
    hours: days(ALL, allDay), tables: LARGE },
  { slug: 'masala-demo', name: 'Masala Demo', cuisine: 'Indisch', price_level: 1, rating: 4.4, rating_count: 96,
    city: 'Berlin', address: 'Testplatz 3, 10999 Berlin', lat: 52.4975, lon: 13.4250,
    description: 'Currys, Tandoori und viele vegetarische und vegane Gerichte.',
    hours: days(ALL, lunch, dinner), tables: MEDIUM },
  { slug: 'bistro-demo', name: 'Bistro Demo', cuisine: 'Französisch', price_level: 4, rating: 4.8, rating_count: 74,
    city: 'Berlin', address: 'Musterdamm 88, 10707 Berlin', lat: 52.5010, lon: 13.3180,
    description: 'Feine französische Küche mit Menü und Weinbegleitung.',
    hours: days([2, 3, 4, 5, 6], late), tables: SMALL },
  { slug: 'taverna-demo', name: 'Taverna Demo', cuisine: 'Griechisch', price_level: 2, rating: 3.9, rating_count: 301,
    city: 'Berlin', address: 'Beispielstraße 41, 12043 Berlin', lat: 52.4810, lon: 13.4350,
    description: 'Grillplatten und Meze, familienfreundlich mit großer Terrasse.',
    hours: days(NOT_MON, dinner), tables: MEDIUM },
  { slug: 'wirtshaus-demo', name: 'Wirtshaus Demo', cuisine: 'Deutsch', price_level: 2, rating: 4.5, rating_count: 420,
    city: 'München', address: 'Mustergasse 7, 80331 München', lat: 48.1370, lon: 11.5760, max_party_size: 10,
    description: 'Bayerische Klassiker in der Altstadt, mit Biergarten.',
    hours: days(ALL, allDay), tables: LARGE },
  { slug: 'osteria-demo', name: 'Osteria Demo', cuisine: 'Italienisch', price_level: 3, rating: 4.6, rating_count: 188,
    city: 'München', address: 'Beispielring 19, 80799 München', lat: 48.1530, lon: 11.5740,
    description: 'Norditalienische Küche, frische Pasta und eine lange Weinkarte.',
    hours: days(NOT_SUN, lunch, dinner), tables: MEDIUM },
  { slug: 'pho-demo', name: 'Pho Demo', cuisine: 'Vietnamesisch', price_level: 1, rating: 4.3, rating_count: 233,
    city: 'München', address: 'Probestraße 52, 80469 München', lat: 48.1290, lon: 11.5720,
    description: 'Dampfende Pho, Sommerrollen und Bánh mì. Schnell und unkompliziert.',
    hours: days(ALL, lunch, dinner), tables: SMALL },
  { slug: 'gruenzeug-demo', name: 'Grünzeug Demo', cuisine: 'Vegetarisch', price_level: 2, rating: 4.7, rating_count: 119,
    city: 'München', address: 'Testallee 9, 80636 München', lat: 48.1520, lon: 11.5340,
    description: 'Kreative vegetarische und vegane Küche, saisonal und regional.',
    hours: days(NOT_MON, dinner), tables: SMALL },
];

const PROFILE = ['description', 'cuisine', 'price_level', 'rating', 'rating_count', 'address', 'city', 'lat', 'lon'];
const PROFILE_SET = PROFILE.map((c, i) => c + ' = $' + (i + 2)).join(', ');

/**
 * Sorgt dafür, dass alle Demo-Restaurants existieren und ein Profil haben. Bereits vorhandene
 * Restaurants bleiben unverändert; nur ein fehlendes Profil (ältere Datenbank) wird ergänzt.
 */
export async function seedDemo(db, adminKey = process.env.ADMIN_KEY) {
  const slugs = DEMO_RESTAURANTS.map((r) => r.slug);
  const [{ n }] = await db.query(
    'SELECT count(*)::int AS n FROM restaurants WHERE slug = ANY($1::text[]) AND lat IS NOT NULL', [slugs]);
  if (n === slugs.length) return;

  const key = adminKey ?? randomBytes(24).toString('base64url');
  let created = 0;
  for (const r of DEMO_RESTAURANTS) {
    if (await createRestaurant(db, { ...r, adminKey: key })) created += 1;
    else {
      await db.query('UPDATE restaurants SET ' + PROFILE_SET + ' WHERE slug = $1 AND lat IS NULL',
        [r.slug, ...PROFILE.map((c) => r[c])]);
    }
  }
  if (!created) return;
  console.log(created + ' Demo-Restaurants angelegt.');
  // Ein per Umgebungsvariable gesetzter Schlüssel gehört nicht ins Server-Protokoll.
  if (adminKey) console.log('Admin-Schlüssel: aus der Umgebungsvariable ADMIN_KEY');
  else console.log('Admin-Schlüssel (für alle Demo-Restaurants): ' + key + '  (bitte notieren – er wird nur gehasht gespeichert)');
}
