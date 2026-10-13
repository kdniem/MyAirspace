# Typen-Glyphen: Prüfung der Zuordnung

Stand: 2026-10-12 · Geprüft: `js/glyphs.js` (`MA.glyphs.kind`), mit `js/format.js` (`isRotorcraft`).

## Methode

`MA.glyphs.kind({ type, category })` wurde mit einem kleinen Node-Skript aufgerufen. Das Skript lädt `js/format.js` und `js/glyphs.js` per `vm` in einen Kontext mit `window.MA`, ohne Browser und ohne Änderung am Repo. Die Ergebnisse stehen unten. Die erwartete Silhouette ist die fachliche Einschätzung; ICAO-Designatoren wurden nicht gegen Doc 8643 geprüft, außer wo unten "unverifiziert" steht. Es gibt im Repo keine Typentabelle.

Die Zuordnung wird in dieser Reihenfolge geprüft (erster Treffer gewinnt): Hubschrauber (`isRotorcraft`), Jumbo, Wide, Fighter, Biz, Prop, Regional, Small, Narrow (Liste), dann der ADS-B-Kategorie-Fallback (`A5` wide, `A2` regional, `A1`/`B1`/`B4`/`B6` small, sonst narrow).

## Ergebnis

Legende: OK = Silhouette passt. FEHLER = falsche Silhouette, siehe Liste unten.

| Typ (ICAO) | Kategorie | Ergebnis | Erwartet | Bewertung |
|---|---|---|---|---|
| A320, B738, A21N | A3 | narrow | narrow | OK |
| E175, CRJ9 | A2 | regional | regional | OK |
| AT76, DH8D, SF34, AT45 | A2 | prop | prop (Turboprop) | OK |
| BE20, B190, PC12, C208 | A1/A2 | prop | prop | OK |
| PC24, C56X, GLF6, GLEX, LJ45, C25B, FA7X, E55P | A2 | biz | biz | OK |
| C172, PA28, DA40 | A1 | small | small | OK |
| C130, A400 | A5 | prop | prop (4 Turboprops) | OK |
| C295 | A3 | prop | prop | OK |
| C17 | A5 | wide | wide | OK |
| A332 (auch MRTT) | A3 | wide | wide | OK |
| EUFI, F16, F18, F35, TOR, T38 | A3 | fighter | fighter | OK |
| H145, EC35, AS50, B06, R44, H125 | A7 / A3 | heli | heli | OK |
| A388, B748, A346 | A5 | jumbo | jumbo | OK |
| B77W, B789, A3ST | A5 | wide | wide | OK |
| F100, B461, MD11 | A3/A5 | regional / wide | regional / wide | OK |
| DH8C, JS41, SB20, E120 | A2/A3 | prop | prop | OK |
| SU95 | A3 | **fighter** | regional | **FEHLER** (1) |
| B350 (King Air 350) | A2 | **regional** | prop (2 Turboprops) | **FEHLER** (2) |
| GL5T (Global 5000) | A2 | **regional** | biz | **FEHLER** (3), Designator unverifiziert |
| F18S (Super Hornet) | A3 | **narrow** | fighter | **FEHLER** (4), Designator unverifiziert |
| (leer) | A2 / A1 | regional / small | Kategorie-Fallback | OK (so gewollt) |
| (leer) | A6 (hohe Leistung) | narrow | kein eigener Glyph | Hinweis (5) |
| (leer) | B2 (Ballon) | narrow | kein eigener Glyph | Hinweis (6) |
| ZZZZ (unbekannt) | A3 | narrow | Fallback narrow | OK |

## Falsche Zuordnungen

1. **SU95** (Sukhoi Superjet 100) wird als `fighter` gezeichnet. Ursache: Das Muster `SU\d\d` in `FIGHTER` greift vor der Regionalliste, die SU95 ausdrücklich enthält. Erwartet: `regional`. **Korrigiert** in P2.1 mit Test `tools/tests/glyph-test.cjs`, einzige Änderung ist ein Lookahead `SU(?!95)\d\d`.
2. **B350** (Beechcraft King Air 350) ist in keiner Liste und fällt auf den Kategorie-Fallback A2 zurück: `regional`. Erwartet: `prop`, zweimotorig mit Turboprops. Der Designator B350 wurde über eine Drittseite bestätigt (keine offizielle ICAO-Quelle abgerufen). **Nicht geändert**: Aufnahme in `PROP` ist eine Typ-Erweiterung, kein offensichtlicher Regex-Fehler. Vorschlag: `B350` und `B300` in `PROP` aufnehmen, nach Freigabe.
3. **GL5T** (Bombardier Global 5000) fällt ebenfalls auf A2 und wird `regional`. Erwartet: `biz`. Designator **unverifiziert**. Nicht geändert.
4. **F18S** (Super Hornet) passt nicht auf `F18` (exakt), fällt auf `narrow`. Erwartet: `fighter`. Designator **unverifiziert**. Nicht geändert.

## Hinweise ohne Änderung

5. `DH8[A-D]x` in `REGIONAL` enthält ein kleines `x`, das nach dem Umwandeln in Großbuchstaben nie passt. Ohne Wirkung, weil `DH8` schon in `PROP` steht und dort früher greift.
6. Die Kategorien `A6` (hohe Leistung, Kampfflugzeuge) und `B2` (Ballon) bekommen keinen eigenen Glyph und fallen auf `narrow`. Für die Anzeige eines Ballons als Jet ist das falsch, im Alltag der Nerds vermutlich selten.
7. `isRotorcraft` (`js/format.js`) erkennt nur die dort festgelegte Liste (u. a. EC\d\d, H1\d\d, AS\d\d, R22, R44, R66, B06, B407, A109, S76, S92, NH90) und die Kategorie `A7`. Hubschrauber außerhalb dieser Liste, die keine Kategorie A7 senden, werden als Flugzeug gezeichnet.

## Nicht geprüft

- Vollständige ICAO-Liste (Doc 8643). Die Prüfung deckt die gängigen Typen und die in der Regex genannten Sonderfälle ab, nicht den Gesamtbestand.
- Militärische Codes außer den oben genannten (z. B. Eurofighter, Tornado, Hercules) wurden nur nach Muster beurteilt.
