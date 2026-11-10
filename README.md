# Tischbuchung

Ein einbettbares Tischreservierungs-System für Restaurant-Websites, ähnlich wie OpenTable.
Restaurants binden ein kleines Skript in ihre Website ein. Gäste wählen dort Personenzahl,
Datum und Uhrzeit und reservieren direkt. Das Team sieht die Buchungen in einer
Verwaltungsoberfläche.

**Keine externen Abhängigkeiten:** Es wird nur Node.js ≥ 22.13 benötigt (mit dem eingebauten
`node:sqlite`).

## Schnellstart

```bash
npm start          # startet auf http://localhost:3000 und legt ein Demo-Restaurant an
npm test           # Unit- und API-Tests
```

Beim ersten Start wird das fiktive Restaurant `trattoria-demo` angelegt und der
**Admin-Schlüssel** in der Konsole ausgegeben. Sie können ihn auch festlegen:
`ADMIN_KEY=geheim npm start`.

| Seite | Zweck |
|---|---|
| `/demo.html` | Beispiel-Restaurant-Website mit eingebettetem Widget |
| `/admin.html` | Tagesübersicht, Status ändern (platziert, nicht erschienen …), Tage sperren |
| `/embed.html?token=…` | Link für Gäste zum Einsehen und Stornieren |

Umgebungsvariablen: `PORT` (Standard 3000), `DB_FILE` (Standard `data/tischbuchung.db`), `ADMIN_KEY`.

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

## Wie die Verfügbarkeit berechnet wird

- **Öffnungszeiten** werden pro Wochentag als *erste* und *letzte Ankunftszeit* angegeben.
  Mehrere Zeiträume pro Tag sind möglich (z. B. Mittag und Abend).
- Zeitfenster entstehen im Raster `slot_interval_min` (z. B. alle 15 Minuten).
- Jede Reservierung belegt einen Tisch für `duration_min` (z. B. 90 Minuten).
- **Tischzuweisung:** Es wird automatisch der kleinste freie Tisch gewählt, dessen
  `min_capacity`–`max_capacity` zur Gruppe passt. So bleiben große Tische für große Gruppen frei.
- Regeln: Vorlaufzeit (`min_notice_min`), Buchungshorizont (`booking_horizon_days`), maximale
  Gruppengröße (`max_party_size`) und Sperrtage (Feiertage, Betriebsferien).
- **Doppelbuchungen** werden verhindert: Die Verfügbarkeit wird innerhalb einer
  `BEGIN IMMEDIATE`-Transaktion erneut geprüft, bevor gespeichert wird.
- Alle Zeiten gelten in der Zeitzone des Restaurants (`timezone`, z. B. `Europe/Berlin`).

## API

Öffentlich (mit CORS, also auch direkt von einer eigenen Website aufrufbar):

| Methode | Pfad | Beschreibung |
|---|---|---|
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

Schutz gegen Missbrauch: Rate-Limit pro IP für Buchungen, ein Honeypot-Feld gegen Bots,
Begrenzung der Eingabelängen. Admin-Schlüssel werden nur als SHA-256-Hash gespeichert.

## Projektstruktur

```
src/
  availability.js   reine Verfügbarkeits- und Tischzuweisungslogik (gut testbar)
  db.js             SQLite-Schema, Transaktionen, Restaurant anlegen
  server.js         HTTP-Server, API-Routen, statische Dateien
  seed.js           Demo-Restaurant
  time.js           Datums- und Zeit-Hilfsfunktionen, Zeitzonen
  index.js          Startpunkt
public/
  widget.js         Einbettungs-Skript für Restaurant-Websites
  embed.html/.js    Buchungsoberfläche (läuft im iframe)
  admin.html        Verwaltungsoberfläche
  demo.html         Beispiel-Restaurant-Website
test/               node:test-Tests
```

## Nächste Schritte für den Produktivbetrieb

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
7. **Betrieb**: HTTPS, Backups der SQLite-Datei. Bei mehreren Server-Instanzen: PostgreSQL
   und ein gemeinsames Rate-Limit (z. B. Redis).
8. Optional: Anzahlung bzw. Kreditkartengarantie gegen No-Shows, Warteliste, Google-Reservierung.
