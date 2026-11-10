# ResellHub

Eine schlanke Web-App zum Managen und Skalieren eines privaten Reselling-Business –
Inventar, Verkäufe, Ausgaben und Kennzahlen an einem Ort. Läuft komplett im Browser,
ohne Server, ohne Konto, auch offline (installierbar als PWA).

## Funktionen

- **Dashboard** – Umsatz, Nettogewinn, Marge, ROI, Ø Gewinn pro Artikel, Ø Tage bis Verkauf,
  Einkaufsvolumen und Lagerwert für frei wählbare Zeiträume; Monatsziel mit Hochrechnung;
  Gewinn-Chart der letzten 12 Monate; Auswertung nach Plattform und Kategorie;
  Ladenhüter-Liste (Artikel, die zu lange im Bestand sind).
- **Inventar** – Artikel mit SKU (automatisch), Kategorie, Marke, Größe, Zustand,
  Einkaufsquelle, Einkaufs-/Nebenkosten, Angebotspreis, Lagerort und Plattformen.
  Suche, Filter, Sortierung, Duplizieren, Preisvorschlag nach Ziel-ROI.
- **Verkauf erfassen** – Gebühren werden je Plattform automatisch berechnet,
  Live-Vorschau von Auszahlung, Gewinn und ROI. Verkäufe lassen sich rückgängig machen (Retouren).
- **Verkäufe** – Filter nach Plattform/Monat, CSV-Export (z. B. für die Steuer/EÜR).
- **Ausgaben** – Betriebskosten (Versandmaterial, Abos, Fahrtkosten …) fließen in den Nettogewinn ein.
- **Einstellungen** – Monatsziel, Ladenhüter-Schwelle, Ziel-ROI, Plattformen mit Gebühren (% + fix),
  JSON-Backup/-Wiederherstellung, CSV-Import/-Export, Demodaten.

## Starten

```bash
cd app
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Oder `app/index.html` direkt im Browser öffnen (dann ohne Offline-/Installationsfunktion).
Zum Hosten reicht jeder statische Hoster (z. B. GitHub Pages, Netlify, Vercel) mit dem Ordner `app/`.

## Daten

Alle Daten liegen im `localStorage` des Browsers – nur auf diesem Gerät.
Lade regelmäßig unter **Einstellungen → Backup herunterladen** eine Sicherung herunter;
damit kannst du die Daten auch auf ein anderes Gerät übertragen.

Die Standard-Plattformgebühren sind nur Richtwerte – bitte in den Einstellungen an deine
tatsächlichen Konditionen anpassen.
