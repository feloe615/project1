# Tischbuchung

Eine Plattform zum Buchen von Tischen in Restaurants, ähnlich wie OpenTable. Sie besteht aus
zwei Teilen:

- **Marktplatz für Gäste** (`/`): Datum, Uhrzeit, Personenzahl, Ort und Umkreis wählen, nach
  Küche, Preis und Bewertung filtern. Angezeigt werden nur Restaurants, die zu dieser Zeit
  wirklich einen passenden Tisch frei haben. Gebucht wird direkt auf der Seite.
- **Widget für Restaurant-Websites**: Restaurants binden ein kleines Skript in ihre eigene
  Website ein. Das Team sieht alle Buchungen in einer Verwaltungsoberfläche.

Geplant sind KI-Vorschläge, Gäste-Konten, die Abrechnung einer Vermittlungspauschale und eine
App (siehe „Nächste Schritte“).

**Technik:** Node.js 22 und PostgreSQL. Lokal ist keine Datenbank-Installation nötig: Ohne
`DATABASE_URL` läuft ein eingebettetes PostgreSQL (PGlite) im Ordner `data/`.

## Schnellstart

```bash
npm install
npm start          # startet auf http://localhost:3000 und legt Demo-Restaurants an
npm test           # Unit- und API-Tests
```

Beim ersten Start werden zehn erfundene Demo-Restaurants in Berlin und München angelegt
(`src/seed.js`) und der gemeinsame **Admin-Schlüssel** in der Konsole ausgegeben. Sie können
ihn auch festlegen: `ADMIN_KEY=geheim npm start`.

| Seite | Zweck |
|---|---|
| `/` | Marktplatz: Restaurants mit freiem Tisch suchen und buchen |
| `/demo.html` | Beispiel-Restaurant-Website mit eingebettetem Widget |
| `/admin.html` | Tagesübersicht, Status ändern (platziert, nicht erschienen …), Tage sperren |
| `/embed.html?token=…` | Link für Gäste zum Einsehen und Stornieren |

| Umgebungsvariable | Bedeutung |
|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindung (`postgres://…`). Ohne sie wird lokal PGlite verwendet. |
| `ADMIN_KEY` | Admin-Schlüssel des Demo-Restaurants. Wird nur beim Anlegen übernommen. |
| `PORT` | Port für den lokalen Start (Standard 3000) |
| `DB_DIR` | Ordner für PGlite (Standard `data/pgdata`, `memory://` = flüchtig) |
| `TRUST_PROXY_HOPS` | Anzahl der Proxys vor der App (lokal 0, auf Vercel 1) |

## Einbindung auf der Restaurant-Website

```html
<div id="reservierung"></div>
<script src="https://IHR-SERVER/widget.js"
        data-restaurant="trattoria-demo"
        data-target="#reservierung"
        data-color="#b4441e" async></script>
```

Das Widget läuft in einem iframe. So beeinflussen sich die CSS-Stile der Website und des
Widgets nicht, und es funktioniert mit jedem Baukasten (WordPress, Wix, Jimdo, statisches
HTML …). Die Höhe passt sich automatisch an.

## Veröffentlichen auf Vercel

Das Projekt ist für Vercel eingerichtet (`vercel.json`): Die Dateien in `public/` werden direkt
ausgeliefert, alle Anfragen an `/api/*` gehen an die Funktion `api/index.js`.

1. Auf [vercel.com](https://vercel.com) **Add New → Project** wählen und dieses Repository
   importieren. Ein Build-Schritt ist nicht nötig.
2. Im Projekt unter **Storage** eine Postgres-Datenbank anlegen und verbinden (z. B. Neon).
   Dadurch wird `DATABASE_URL` automatisch gesetzt. Am besten eine Region in der Nähe von
   Frankfurt wählen, denn die Funktion läuft in `fra1`.
3. Unter **Settings → Environment Variables** `ADMIN_KEY` auf einen langen, geheimen Wert setzen.
4. Neu deployen. Beim ersten Aufruf werden die Tabellen und das Demo-Restaurant angelegt.
5. Die Demo liegt unter `https://<projekt>.vercel.app/demo.html`, die Verwaltung unter
   `/admin.html`.

Hinweise:

- `ADMIN_KEY` wird nur beim Anlegen des Demo-Restaurants übernommen und danach gehasht
  gespeichert. Eine spätere Änderung der Variable hat keine Wirkung.
- Der kostenlose Vercel-Tarif („Hobby“) ist für nicht-kommerzielle Nutzung gedacht.
- `GET /healthz` prüft, ob die Datenbank erreichbar ist.
- Jeder andere Anbieter mit Node.js und PostgreSQL funktioniert ebenfalls:
  `DATABASE_URL=postgres://… npm start`.

## Wie die Verfügbarkeit berechnet wird

- **Öffnungszeiten** werden pro Wochentag als *erste* und *letzte Ankunftszeit* angegeben.
  Mehrere Zeiträume pro Tag sind möglich (z. B. Mittag und Abend).
- Zeitfenster entstehen im Raster `slot_interval_min` (z. B. alle 15 Minuten).
- Jede Reservierung belegt einen Tisch für `duration_min` (z. B. 90 Minuten).
- **Tischzuweisung:** Es wird automatisch der kleinste freie Tisch gewählt, dessen
  `min_capacity`–`max_capacity` zur Gruppe passt. So bleiben große Tische für große Gruppen frei.
- Regeln: Vorlaufzeit (`min_notice_min`), Buchungshorizont (`booking_horizon_days`), maximale
  Gruppengröße (`max_party_size`) und Sperrtage (Feiertage, Betriebsferien).
- **Doppelbuchungen** werden verhindert: Jede Buchung sperrt in ihrer Transaktion die Zeile
  des Restaurants (`SELECT … FOR UPDATE`) und prüft die Verfügbarkeit erneut, bevor gespeichert
  wird. Gleichzeitige Buchungen laufen dadurch nacheinander, auch über mehrere Instanzen hinweg.
- Alle Zeiten gelten in der Zeitzone des Restaurants (`timezone`, z. B. `Europe/Berlin`).

## API

Öffentlich (mit CORS, also auch direkt von einer eigenen Website aufrufbar):

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/meta` | Städte (mit Mittelpunkt), Küchen und eine sinnvolle Vorgabe für Datum/Uhrzeit |
| GET | `/api/search?date&time&partySize&lat&lon` | Restaurants mit freiem Tisch; optional `radiusKm`, `cuisine` (kommagetrennt), `maxPrice` (1–4), `minRating`, `sort` (`distance`/`rating`) |
| GET | `/api/restaurants/:slug` | Name, max. Gruppengröße, heutiges Datum |
| GET | `/api/restaurants/:slug/availability?date=JJJJ-MM-TT&partySize=N` | Zeitfenster `[{time, available}]` |
| POST | `/api/restaurants/:slug/reservations` | `{date, time, partySize, name, email, phone?, notes?}` → `201` mit `token` |
| GET | `/api/reservations/:token` | Reservierung abrufen |
| DELETE | `/api/reservations/:token` | Reservierung durch den Gast stornieren |

Verwaltung (Header `Authorization: Bearer <Admin-Schlüssel>`):

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/admin/:slug/reservations?date=…` | Alle Reservierungen eines Tages inkl. Tisch und Kontaktdaten |
| PATCH | `/api/admin/:slug/reservations/:id` | `{status}`: `confirmed`, `seated`, `completed`, `cancelled` oder `no_show` |
| GET | `/api/admin/:slug/closures` | Kommende Sperrtage |
| PUT / DELETE | `/api/admin/:slug/closures/:date` | Tag sperren (`{reason?}`) oder freigeben |

Schutz gegen Missbrauch: Rate-Limit pro IP für Buchungen (10 pro 10 Minuten, in der Datenbank
gezählt, gespeichert wird nur ein Hash der IP), ein Honeypot-Feld gegen Bots, Begrenzung der
Eingabelängen. Admin-Schlüssel werden nur als SHA-256-Hash gespeichert.

### So arbeitet die Suche

1. Die Datenbank filtert die harten Kriterien: Gruppengröße, Preis, Bewertung, Küche.
2. Die Entfernung zum gewählten Ort wird berechnet und auf den Umkreis begrenzt.
3. Für die verbleibenden Restaurants wird die Verfügbarkeit berechnet. Übrig bleiben nur
   Restaurants mit freien Zeiten im Abstand von höchstens 90 Minuten zur Wunschzeit.
4. Restaurants mit genau der Wunschzeit stehen oben, danach zählt Entfernung oder Bewertung.

In der Suche erscheinen nur Restaurants mit Standort (`lat`, `lon`, `city`) und `listed = true`.
Bewertungen sind derzeit Platzhalterwerte aus den Demo-Daten.

## Projektstruktur

```
api/
  index.js          Einstiegspunkt für Vercel
src/
  availability.js   reine Verfügbarkeits- und Tischzuweisungslogik (gut testbar)
  db.js             PostgreSQL-Schema, Verbindung (pg oder PGlite), Restaurant anlegen
  server.js         API-Routen, lokal auch statische Dateien
  search.js         Entfernung, Auswahl der Zeiten rund um die Wunschzeit
  seed.js           erfundene Demo-Restaurants
  time.js           Datums- und Zeit-Hilfsfunktionen, Zeitzonen
  index.js          Startpunkt für den lokalen Betrieb
public/
  index.html, search.js  Marktplatz: Suche und Buchung für Gäste
  widget.js         Einbettungs-Skript für Restaurant-Websites
  embed.html/.js    Buchungsoberfläche (läuft im iframe)
  admin.html        Verwaltungsoberfläche
  demo.html         Beispiel-Restaurant-Website
test/               node:test-Tests
vercel.json         Vercel-Konfiguration
```

Die Tests laufen standardmäßig gegen PGlite. Mit `TEST_DATABASE_URL=postgres://… npm test`
laufen sie gegen einen echten PostgreSQL-Server (dessen Schema `public` wird dabei geleert).

## Nächste Schritte

Für den Marktplatz, in dieser Reihenfolge:

1. **KI-Vorschläge**: Freitext-Wünsche verstehen ("ruhiger Italiener für ein Date"), Treffer
   sortieren und begründen. Die harten Kriterien bleiben in der Datenbank.
2. **Gäste-Konten** (eigene Buchungen, Favoriten, Bewertungen) und **Selbstanmeldung für
   Restaurants** (Profil, Öffnungszeiten, Tische selbst pflegen).
3. **Abrechnung der Vermittlungspauschale** pro Reservierung, z. B. über Stripe.
4. **App**: installierbare Web-App, danach Apps für App Store und Play Store auf derselben API.
5. **Echte Standortsuche**: Adresse eingeben (Geocoding) statt Stadt aus der Liste; bei vielen
   Restaurants die Umkreissuche in die Datenbank verlagern (PostGIS).

Für den Produktivbetrieb allgemein:

1. **E-Mail-Bestätigung und Erinnerung** (z. B. über SMTP oder Postmark). In `server.js` ist
   die Stelle markiert. Der Verwaltungslink mit Token gehört in diese E-Mail.
2. **Benutzerkonten statt Admin-Schlüssel**: mehrere Mitarbeitende, Rollen, Passwort-Reset.
3. **Einstellungsoberfläche** für Öffnungszeiten, Tische und Regeln. Heute werden sie über
   `createRestaurant()` bzw. die Datenbank gepflegt.
4. **Telefonische Buchungen und Walk-ins** direkt in der Verwaltung erfassen.
5. **Tischkombinationen** (zwei 4er-Tische für 8 Personen) und unterschiedliche Verweildauer
   je Gruppengröße.
6. **DSGVO**: Datenschutzhinweis im Widget, Auftragsverarbeitungsvertrag mit den Restaurants,
   automatische Löschung alter Gästedaten.
7. **Betrieb**: regelmäßige Backups der Datenbank, Überwachung, Schema-Migrationen für
   künftige Änderungen an den Tabellen.
8. Optional: Anzahlung bzw. Kreditkartengarantie gegen No-Shows, Warteliste, Google-Reservierung.
