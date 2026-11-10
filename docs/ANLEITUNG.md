# Reselling Scaler als eigene Website einrichten

Du brauchst zwei kostenlose Dienste:

- **Supabase** für Konten (Login mit E-Mail und Passwort) und die Datenbank
- **Netlify** oder **GitHub Pages**, damit die Website einen eigenen Link bekommt

Dauer: etwa 15 Minuten.

Die Website besteht aus diesen Dateien im Ordner `docs/`:

| Datei | Zweck |
|---|---|
| `index.html` | Die Seite selbst |
| `app.js` | Die Logik (Berechnungen, Login, Speichern) |
| `config.js` | **Hier trägst du deine Supabase-Daten ein** |
| `schema.sql` | Legt die Datenbank-Tabellen an |

---

## Schritt 1: Supabase-Projekt anlegen

1. Auf **supabase.com** kostenlos registrieren und **New project** anlegen.
   Region: z. B. *Frankfurt (eu-central-1)*. Datenbank-Passwort notieren.
2. Links im Menü **SQL Editor** öffnen, **New query** anklicken.
3. Den kompletten Inhalt von `docs/schema.sql` einfügen und **Run** klicken.
   Danach gibt es die Tabellen `items` und `user_settings`. Jede Person sieht nur ihre eigenen Daten.

## Schritt 2: Zugangsdaten in `config.js` eintragen

1. In Supabase: **Project Settings → API** (bzw. **Data API / API Keys**).
2. Kopiere die **Project URL** und den **anon public** Key.
3. Öffne `docs/config.js` und ersetze die Platzhalter:

```js
window.RESELLING_CONFIG = {
  supabaseUrl: "https://abcdefgh.supabase.co",
  supabaseAnonKey: "eyJhbGciOi..."
};
```

Der *anon* Key darf öffentlich auf der Website stehen. Die Datenbank-Regeln schützen die Daten.
Den **service_role** Key trägst du **niemals** hier ein.

## Schritt 3: Website online stellen

### Variante A: Netlify (am einfachsten, klappt auch bei privaten Repos)

1. Auf **app.netlify.com** registrieren.
2. **Add new site → Deploy manually** und den Ordner `docs` per Drag & Drop hineinziehen.
3. Du bekommst sofort einen Link wie `https://dein-name.netlify.app`.
   Unter **Site configuration → Change site name** kannst du den Namen anpassen.

Alternativ **Import from Git** wählen, dieses Repository verbinden und als *Publish directory* `docs` eintragen.
Dann geht jede Änderung im Repo automatisch online.

### Variante B: GitHub Pages

1. Im Repository auf GitHub: **Settings → Pages**.
2. *Source*: **Deploy from a branch**, Branch auswählen, Ordner **/docs**, speichern.
3. Nach ein bis zwei Minuten ist die Seite unter `https://<dein-github-name>.github.io/<repo>/` erreichbar.

Hinweis: Bei **privaten** Repositories braucht GitHub Pages ein kostenpflichtiges GitHub-Konto. Nimm dann Netlify.

## Schritt 4: Login-Links auf deine Website zeigen lassen

Damit Bestätigungs- und Passwort-Links aus den E-Mails auf deiner Seite landen:

1. In Supabase: **Authentication → URL Configuration**.
2. **Site URL**: deinen Website-Link eintragen, z. B. `https://dein-name.netlify.app`.
3. Unter **Redirect URLs** denselben Link noch einmal hinzufügen.

## Schritt 5: Konto anlegen und loslegen

1. Website öffnen, **Konto erstellen**, E-Mail und Passwort (mind. 8 Zeichen) eingeben.
2. Bestätigungs-E-Mail öffnen und auf den Link klicken.
3. Anmelden. Fertig: Alle Artikel, Gebühren, Einstellungen und die Checkliste werden in deinem Konto gespeichert.

Tipp: Unter **Einstellungen → Beispieldaten laden** siehst du sofort, wie Dashboard und Plan aussehen.
Mit **Alle Daten löschen** entfernst du sie wieder.

---

## Häufige Fragen

**Ich will mich nicht anmelden lassen, nur ich soll die Seite nutzen.**
Nachdem du dein Konto angelegt hast: in Supabase **Authentication → Sign In / Providers → Email** die Option
*Allow new users to sign up* ausschalten. Dann kann sich niemand mehr neu registrieren.

**Daten aus der alten HTML-Datei übernehmen?**
In der alten Datei unter *Einstellungen* **Backup (JSON) herunterladen**, dann auf der Website unter
*Einstellungen* **Backup laden**.

**Eigene Domain (z. B. `meinreselling.de`)?**
Bei Netlify unter **Domain management → Add a domain**. Danach die neue Adresse auch in Supabase
(Schritt 4) eintragen.

**Kosten?**
Der kostenlose Tarif von Supabase und Netlify reicht für ein kleines Business locker. Kostenlose
Supabase-Projekte werden pausiert, wenn sie eine Woche lang nicht genutzt werden. Du reaktivierst sie mit einem Klick im Supabase-Dashboard.

**Bestätigungs-E-Mails kommen nicht an?**
Spam-Ordner prüfen. Der eingebaute E-Mail-Versand von Supabase ist auf wenige Mails pro Stunde begrenzt.
Für mehr Nutzer kannst du unter **Authentication → Emails → SMTP Settings** einen eigenen Mailversand eintragen.
