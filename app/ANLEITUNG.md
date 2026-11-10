# Resell Scaler – App einrichten, testen und veröffentlichen

Die App läuft auf **iPhone und Android** (Expo / React Native). Konten und Daten liegen in **Supabase**.
Jede Person hat ein eigenes Konto (E-Mail und Passwort) und sieht nur ihre eigenen Daten.

**Funktionen:** Übersicht mit Kennzahlen und Diagrammen, Lager mit Suche und Filter, Artikel anlegen und bearbeiten,
Gewinnrechner für alle Plattformen, Skalierungsplan mit Wachstumssimulation, Fahrplan-Checkliste,
eigene Plattform-Gebühren, CSV-Import und -Export, Backup, Passwort ändern, Konto löschen.

---

## 1. Supabase einrichten (einmalig, ca. 5 Minuten)

1. Auf **supabase.com** kostenlos registrieren und **New project** anlegen (Region z. B. Frankfurt).
2. **SQL Editor → New query**: den kompletten Inhalt von `supabase/schema.sql` einfügen und **Run** klicken.
3. **Project Settings → API**: **Project URL** und **anon public Key** kopieren.
4. Im Ordner `app/` die Datei `.env.example` nach `.env` kopieren und beide Werte eintragen:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   Der anon-Key darf in der App stehen. Den **service_role**-Key trägst du **niemals** ein.

5. **Authentication → URL Configuration → Redirect URLs**: diese beiden Einträge hinzufügen, damit die Links aus
   Bestätigungs- und Passwort-Mails die App öffnen:

   ```
   resellscaler://**
   exp://**
   ```

## 2. Auf dem eigenen Handy testen (ohne App Store)

Voraussetzung: Node.js (Version 20 oder neuer) auf deinem Computer.

```bash
cd app
npm install
npx expo start
```

1. Auf dem Handy die App **Expo Go** aus dem App Store bzw. Play Store installieren.
2. Den QR-Code aus dem Terminal scannen (iPhone: mit der Kamera, Android: in Expo Go).
3. Die App startet, du kannst ein Konto erstellen und loslegen.

Handy und Computer müssen im selben WLAN sein. Falls nicht: `npx expo start --tunnel`.

## 3. Echte App bauen (installierbare Datei)

Die Builds laufen in der Expo-Cloud, du brauchst kein Xcode und kein Android Studio.

```bash
npm install -g eas-cli
eas login            # kostenloses Konto auf expo.dev
eas init             # verknüpft das Projekt
```

Die Werte aus `.env` müssen auch für Cloud-Builds verfügbar sein:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://abcdefgh.supabase.co" --visibility plaintext --environment preview --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJhbGciOi..." --visibility plaintext --environment preview --environment production
```

**Android-Testversion (APK zum direkten Installieren):**

```bash
eas build --platform android --profile preview
```

Am Ende bekommst du einen Link bzw. QR-Code. Damit kannst du die APK auf jedem Android-Handy installieren.

**iPhone-Testversion:** Dafür brauchst du ein Apple-Developer-Konto (siehe unten).

```bash
eas build --platform ios --profile production
eas submit --platform ios      # lädt zu TestFlight hoch
```

## 4. In App Store und Play Store veröffentlichen

| | Apple App Store | Google Play Store |
|---|---|---|
| Entwicklerkonto | Apple Developer Program, 99 $ pro Jahr | Google Play Console, 25 $ einmalig |
| Build | `eas build -p ios --profile production` | `eas build -p android --profile production` |
| Hochladen | `eas submit -p ios` | `eas submit -p android` |

Das brauchst du außerdem für die Stores:

- **Eindeutige App-Kennung:** In `app.json` stehen `com.resellscaler.app` (iOS `bundleIdentifier`, Android `package`).
  Ersetze sie vor dem ersten Store-Build durch eine eigene, z. B. `de.deinname.resellscaler`. Danach lässt sie sich nicht mehr ändern.
- **Datenschutzerklärung als Link:** Beide Stores verlangen eine URL. Sie muss erklären, dass E-Mail-Adresse und
  Geschäftsdaten bei Supabase gespeichert werden.
- **Impressum:** In Deutschland bei geschäftlichem Angebot Pflicht.
- **Konto löschen:** Apple verlangt, dass Nutzer ihr Konto in der App löschen können. Das ist eingebaut (Mehr → Konto löschen).
- **App-Symbol und Screenshots:** Ersetze die Platzhalter-Bilder im Ordner `assets/` durch dein eigenes Logo.
- **E-Mail-Versand:** Der eingebaute Versand von Supabase schickt nur wenige Mails pro Stunde. Für viele Nutzer
  trägst du unter *Authentication → Emails → SMTP Settings* einen eigenen Mailanbieter ein (z. B. Brevo oder Resend).

## 5. Updates ohne neuen Store-Upload

Kleine Änderungen (Texte, Berechnungen, Design) kannst du direkt an alle Nutzer schicken:

```bash
npx expo install expo-updates
eas update:configure
eas update --channel production --message "Beschreibung der Änderung"
```

---

## Projektaufbau

```
app/
├─ src/app/            Screens (Expo Router): Login, Tabs, Artikel-Formular
│  └─ (tabs)/          Übersicht, Lager, Rechner, Plan, Mehr
├─ src/lib/calc.ts     Alle Berechnungen (Gebühren, Gewinn, ROI, Plan, Simulation, CSV)
├─ src/lib/store.tsx   Anmeldung und Speichern in Supabase
├─ src/components/     Wiederverwendbare Bausteine (Karten, Felder, Buttons, Diagramme)
├─ supabase/schema.sql Datenbank-Tabellen, Zugriffsregeln, Konto-Löschfunktion
└─ .env                Deine Supabase-Zugangsdaten (aus .env.example)
```

Nützliche Befehle: `npx tsc --noEmit` (Typprüfung), `npx expo-doctor` (prüft die Abhängigkeiten).
