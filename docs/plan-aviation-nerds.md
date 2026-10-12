# Plan: MyAirspace für Aviation-Nerds

Stand: 2026-10-12 · Branch: `claude/quirky-curie-dwzbli`

## Ziel

MyAirspace soll für Luftfahrt-Enthusiasten verlässlich und fachlich korrekt laufen. Der Erfolg wird gemessen an:

- Korrektheit: Pisten, Anfluglinien, Flugzeugtypen und Rufzeichen stimmen für EDDH und EDHI.
- Verfügbarkeit: Der Bildschirm zeigt Daten, und Ausfälle sind nachvollziehbar.
- Rückmeldung: Nerds nennen konkrete Fehler oder Wünsche, und wir können sie nachvollziehen.

Nicht Ziel dieses Plans: Einrichtung für Laien, Monetarisierung, breite Vermarktung.

## Team und Rollen

Jede Aufgabe hat eine Rolle. Ein Agent kann mehrere Rollen übernehmen, aber nicht zwei Aufgaben gleichzeitig an derselben Datei.

| Rolle | Verantwortet |
|---|---|
| **Daten** | Datenquellen, Ausfallverhalten, Uptime-Log |
| **Korrektheit** | Pisten, Anflüge, Typen-Glyphen, Rufzeichen-Prüfung |
| **Frontend** | Anzeige, Stile, Schalter, Lesbarkeit |
| **QA** | Tests, Kontrast, Regressionen |
| **Doku/Community** | Post-Entwürfe, Fragen an Nerds, Auswertung |

Der Verantwortliche für Freigaben (Veröffentlichung, Posts, Merge) ist der Repo-Eigentümer. Agenten bereiten vor, veröffentlichen aber nichts ohne Freigabe.

## Phase 0: Baseline (Voraussetzung für alles)

**P0.1 · QA · Tests lokal laufen lassen**
- `npm run test:quick` und `node tools/contrast.mjs` ausführen.
- Ergebnis in `docs/baseline.md` festhalten: welche Tests bestehen, welche nicht.
- Akzeptanz: Stand ist dokumentiert. Fehlschläge werden nicht stillschweigend ignoriert.

**P0.2 · Daten · Quellen-Verhalten dokumentieren**
- Die Reihenfolge der Quellen in `js/data.js` (`ORDER`, `usable`) und die Optionen `provider` und `public` in `js/config.js` beschreiben.
- Akzeptanz: `docs/data-sources.md` nennt pro Quelle Standard-Verhalten, Fallback und Rate-Limit-Risiko. Angaben zu Limits, die nicht verifiziert sind, werden als "unverifiziert" markiert.

## Phase 1: Datenqualität

**P1.1 · Korrektheit · Pisten und Anflüge prüfen**
- `data/airport-detail.js` und `data/chart-features.js` gegen aktuelle Luftfahrtdaten für EDDH (Hamburg) und EDHI (Finkenwerder) prüfen.
- Fehlende oder falsche Pisten, Schwellen und Anfluglinien in `docs/corrections-airports.md` auflisten, mit Quelle für jede Korrektur.
- Akzeptanz: Jede Korrektur hat eine Quelle. Änderungen an den Daten erst nach Freigabe.

**P1.2 · Korrektheit · Typen-Glyphen prüfen**
- `js/glyphs.js` wählt die Silhouette aus dem ICAO-Typ, mit ADS-B-Kategorie als Fallback.
- Testliste mit gängigen und ungewöhnlichen Typen anlegen (z. B. Turboprops, Business-Jets, Militär). Ergebnis in `docs/glyph-check.md`.
- Akzeptanz: Falsche Zuordnungen sind dokumentiert, mit Typ und erwarteter Silhouette.

**P1.3 · Daten · Uptime-Log einrichten**
- Eine einfache Protokollierung der Quellen-Antworten, Fehler und Fallbacks (Zeitstempel, Quelle, Status). Vorhandene `js/log.js` prüfen und wiederverwenden, nichts Neues bauen, wenn es reicht.
- Akzeptanz: Nach einer Woche Dauerbetrieb liegt ein Auswertungsbericht vor: Ausfallzeiten, häufigste Fehler, Anteil der Fallbacks.

## Phase 2: Fehlerbehebung

**P2.1 · Frontend · Korrekturen aus P1 umsetzen**
- Nur die in P1 dokumentierten Fehler beheben. Keine neuen Features.
- Jede Korrektur bekommt einen Test in `tools/tests/` oder einen Eintrag in `tools/tests/known-issues.json`, falls sie nicht testbar ist.
- Akzeptanz: `npm test` läuft durch, Korrekturen sind einzeln committet.

**P2.2 · QA · Kontrast und Stile nach jeder Änderung prüfen**
- `node tools/contrast.mjs` nach jeder Frontend-Änderung.
- Akzeptanz: Alle Stile erfüllen WCAG, Text mindestens 4,5:1.

**P2.3 · Frontend · Fehlende Hinweise bei Datenausfall**
- Wenn alle Quellen ausfallen, zeigt der Bildschirm einen dezenten Hinweis statt einer leeren Fläche.
- Akzeptanz: Bei simuliertem Ausfall (Quelle blockieren) erscheint der Hinweis, nach Wiederherstellung verschwindet er. Test in `tools/tests/poll-test.cjs` oder neuer Test.

## Phase 3: Nerd-Feedback

**P3.1 · Community · Fragenkatalog erstellen**
- Konkrete Fragen an Nerds, zum Beispiel: Stimmen Pisten und Anflüge für EDDH? Welcher Typ fehlt? Welcher Stil fehlt?
- Fragen in `docs/nerd-questions.md`.
- Akzeptanz: Jede Frage ist konkret und mit Ja/Nein oder einem Typ beantwortbar.

**P3.2 · Community · Post-Entwurf schreiben**
- Entwurf für ein Forum oder Reddit mit Screenshot und Demo-Link (`?demo=1`). Ziel-Communities vorher prüfen, Namen sind nicht verifiziert.
- Entwurf in `docs/community-post-draft.md`.
- Akzeptanz: Entwurf steht. Veröffentlichung nur nach Freigabe.

**P3.3 · Community · Rückmeldungen sammeln und auswerten**
- Antworten in `docs/nerd-feedback.md` sammeln, nach Korrektheit, Stil und Wünschen sortieren.
- Akzeptanz: Jede Rückmeldung ist einer Aufgabe zugeordnet oder bewusst verworfen, mit Grund.

## Phase 4: Public-Konfiguration

**P4.1 · Daten · Standardwerte für `public` absichern**
- `public=1` erlaubt öffentliche CORS-Proxys und externe Quellen. Prüfen, ob der Standard datenschutzkonform ist, und die Doku in der README entsprechend schärfen.
- Akzeptanz: Die README beschreibt klar, was `public=1` an Daten nach außen gibt.

## Abhängigkeiten

- P0 vor allem anderen.
- P1.1 und P1.2 können parallel laufen (unterschiedliche Dateien).
- P2 wartet auf P1.
- P3 kann parallel zu P2 starten, der Post erst nach P2.1.
- P4 ist unabhängig.

## Außerhalb des Scopes

- Einrichtungs-Assistent für Laien (`setup.html`), außer bei Fehlern aus P3.
- Monetarisierung, Marketing-Kampagnen.
- Neue Stile oder Großprojekte ohne Nerd-Nachfrage aus P3.

## Freigaben, die ausstehen

- Datenkorrekturen aus P1.1 (vor dem Schreiben).
- Veröffentlichung des Community-Posts (P3.2).
- Änderungen an öffentlichen Standardwerten (P4.1).
