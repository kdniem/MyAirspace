# Korrekturen Flughäfen EDDH und EDHI (P1.1)

Stand: 2026-10-12 · Status: **vorgeschlagen, nicht umgesetzt.** Änderungen an `data/airport-detail.js` und `data/chart-features.js` brauchen die Freigabe des Repo-Eigentümers (Plan, Abschnitt Freigaben). Dieses Dokument ändert keine Daten.

## Was geprüft wurde

- `data/airport-detail.js` (generiert aus OpenStreetMap durch `tools/build-airport-detail.py`): Für HAM (EDDH) stehen sechs Pistensegmente, darunter `05/23` und `15/33`. Für XFW (EDHI) stehen drei Segmente, davon eines mit `05/23`. Geprüft wurden nur die Bezeichnungen und die Geometrie der Segmente, keine Schwellen- oder Längenangaben.
- `data/chart-features.js`: Der Inhalt wurde nur auf Vorhandensein geprüft, nicht auf Richtigkeit einzelner Anflüge.
- Externe Quellen: OurAirports war nicht erreichbar (DNS-Fehler). Eine allgemeine Websuche ergab Sekundärquellen zu EDDH (SkyBrary, VATSIM Germany, SkyVector, eine Atlas-Veröffentlichung um 2004). Die Angaben widersprechen sich an einer Stelle (Länge der Piste 05/23 wird einmal mit 3.250 m, einmal mit 3.666 m genannt). Die offizielle Quelle, das AIP Germany (DFS) für EDDH und EDHI, wurde nicht abgerufen.

## Ergebnis

Es gibt **keine** Korrektur mit verifizierter Quelle. Alle Punkte unten sind deshalb "unverifiziert" und dürfen nicht übernommen werden, bis die Angabe aus dem AIP bestätigt ist.

| # | Flughafen | Punkt | Status | Anmerkung |
|---|---|---|---|---|
| 1 | EDDH | Länge und Breite der Piste 05/23 | unverifiziert | Sekundärquellen widersprechen sich (3.250 m und 3.666 m). AIP prüfen. |
| 2 | EDDH | Länge der Piste 15/33 | unverifiziert | Sekundärquelle nennt ca. 3.666 m, eine Atlas-Quelle 3.665 m. Gleiche Prüfung wie oben. |
| 3 | EDDH | Schwellenversatz (displaced thresholds) an 05 und 23 | unverifiziert | Nur in einer Sekundärquelle in Fuß genannt. Umrechnung und AIP-Prüfung nötig. |
| 4 | EDDH | ILS-Kurse der Pisten (15, 23, 05) | unverifiziert | Quelle VATSIM Germany (Simulation). Nicht als reale Angabe übernehmen. |
| 5 | EDHI | Anzahl der Pisten und Länge 05/23 | unverifiziert | OSM zeigt eine Piste 05/23 und zwei Segmente ohne Bezeichnung. Ob die beiden Segmente Rollwege oder Pistenteile sind, ist offen. |
| 6 | EDHI | Anflugverfahren und Anflugbefeuerung | unverifiziert | Keine Quelle geprüft. |
| 7 | EDDH | Schwellenpositionen in `data/airport-detail.js` | unverifiziert | Die OSM-Geometrie ist für die Anzeige gedacht, nicht als Schwellenreferenz. Ob die Endpunkte der Segmente den realen Schwellen entsprechen, ist ungeprüft. |

## Offene Schritte vor einer Korrektur

1. AIP Germany (DFS) für EDDH und EDHI öffnen: Pistenlängen, Schwellen, Anflugverfahren.
2. Pro Korrektur die Fundstelle (AIP-Abschnitt, Ausgabedatum) hier eintragen.
3. Erst nach Freigabe in `data/airport-detail.js` bzw. `data/chart-features.js` schreiben. Die Datei `airport-detail.js` wird durch `tools/build-airport-detail.py` erzeugt; Änderungen dort oder im Build-Skript, nicht von Hand.

## Nicht Teil dieses Dokuments

- Keine Änderung an Daten, Build-Skript oder Anzeige.
- Keine Aussage zur Navigation; die Datei ist laut Kopfzeile "nicht für Navigation".
