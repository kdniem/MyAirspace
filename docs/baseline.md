# Baseline (P0.1)

Stand: 2026-10-12 · Ausgangspunkt: `origin/main` @ `32018ee` · Branch `claude/aviation-nerds-plan`

## Befehle

- `node tools/tests/run-all.mjs --no-browser`: ohne Browser-Suite.
- `node tools/tests/browser.mjs`: vollständige Browser-Suite (Playwright + Chromium).

Hinweis zum Plan: `npm run test:quick` existiert in `package.json` (führt `run-all.mjs --quick` aus, also inkl. Browser-Suite im Schnellmodus). `tools/contrast.mjs` existiert ebenfalls. Es gibt keine Datei `tools/tests/contrast.mjs`; der Kontrasttest liegt in `tools/contrast.mjs` und wird von `run-all.mjs` als Schritt "contrast" aufgerufen.

## Ergebnis `run-all.mjs --no-browser` (verifiziert am 2026-10-12)

Alle 14 Schritte bestanden (Exit 0, "all steps passed"):

| Schritt | Ergebnis |
|---|---|
| syntax (node --check) | PASS |
| URL options + ES2017 scan (options.cjs) | PASS |
| board selection (pick-test.cjs) | PASS |
| view rotation (rotation-test.cjs) | PASS, 15 Tests |
| diagnostics log (diag-test.cjs) | PASS |
| saved settings (prefs-test.cjs) | PASS |
| glyph kinds (glyph-test.cjs) | PASS, 4 Tests |
| degraded-data notice (nodata-test.cjs) | PASS, 6 Tests |
| old-browser guard (compat.mjs) | PASS |
| contrast (tools/contrast.mjs) | PASS, 140 Kombinationen, 7153 Prüfungen, alle über Ziel; 95 Airline-Kacheln Text >= 4,5:1 |
| chart background (chart-test.cjs) | PASS |
| proxy | PASS, 19 Tests |
| proxy (incl. /api/radar) | PASS, 19 Tests (gleiche Datei wie oben, zweimal ausgeführt) |
| weather radar decoding (wxradar-test.mjs) | PASS, 17 Tests |

Gesamt: 14 Schritte, 0 Fehlschläge. Hinweis: Der Proxy-Test läuft in `run-all.mjs` doppelt (zwei Einträge mit identischem Befehl). Das ist kein Fehler, aber redundant.

## Ergebnis Browser-Suite (`tools/tests/browser.mjs`, vollständig)

- Letzter Lauf am Branch-Ende (vom vorherigen Agenten ausgeführt, in dieser Sitzung nicht erneut ausgeführt): `browser: 128 page loads in 138.1 s (concurrency 4), 0 failing check(s), 0 known issue(s)`, Exit 0.
- Known issues aus `tools/tests/known-issues.json`: keine aktiv.
- Der Baseline-Lauf vor den Plan-Änderungen ergab 127 Seitenläufe, 0 Fehlschläge, 0 known issues. Der 128. Fall ist `nodata_notice`.

## Nicht ausgeführt

- Browser-Suite in dieser Sitzung nicht erneut gelaufen (Code seit dem letzten grünen Lauf nicht geändert; Ergebnis oben stammt vom letzten Lauf).
- `npm run test:quick` nicht ausgeführt.

## Fehlschläge

Keine. Im Baseline-Stand gibt es weder Fehlschläge noch bekannte Ausnahmen.

## Phase-2-Status (nach Abschluss von P0 bis P4)

- **P2.1 (Korrekturen aus P1 umsetzen):** eine Korrektur. P1.2 fand SU95 als Kampfflugzeug gezeichnet; behoben mit Test `tools/tests/glyph-test.cjs`. Die übrigen Befunde aus `docs/glyph-check.md` (B350, GL5T, F18S) sind dokumentiert, aber nicht geändert: Sie sind Typ-Erweiterungen bzw. unverifizierte Designatoren, keine offensichtlichen Regex-Fehler.
- **P2.2 (Kontrast nach jeder Frontend-Änderung):** nach jeder Frontend-Änderung ausgeführt, zuletzt mit der neuen Zeile "Degraded-data notice" (`--dim` auf `--bg`): alle Kombinationen über dem Ziel, 140 Kombinationen, 7153 Prüfungen.
- **P2.3 (Hinweis bei Datenausfall):** umgesetzt, siehe `js/nodata.js`. Die Browser-Suite prüft Erscheinen und Verschwinden bei geblockter Quelle (`nodata_notice`).
- **P1.3 (Uptime-Log):** kein neuer Logger. `js/diag.js` um Wechsel auf Ausweichquellen (`fb`/`pri`) ergänzt, weil dieser Teil fehlte.

## Schlusslauf am Branch-Ende

- `run-all.mjs --no-browser`: 14 Schritte, alle bestanden (inkl. neuer Schritte glyph-test und nodata-test).
- `browser.mjs` (vollständig): 128 page loads, 0 failing, 0 known issues (letzter Lauf, siehe oben).
- Kontrast: 140 Kombinationen, 7153 Prüfungen, alle über dem Ziel.
