# Uptime-Auswertung: Vorlage für den Wochenbericht (P1.3)

Stand: 2026-10-12 · Grundlage: `js/diag.js` (Diagnoseprotokoll) und die Datenquellen aus `docs/data-sources.md`.

Das Protokoll liegt nur auf dem Gerät. Die App sendet nichts. Der Bericht entsteht also aus Exporten, die jemand von Hand herunterlädt.

## Was schon vorhanden war und was neu ist

`js/log.js` ist kein Quellen-Log. Es protokolliert Durchgänge von Flugzeugen durch den Radius. Es wurde deshalb nicht wiederverwendet.

`js/diag.js` deckt Fehler, Ausfälle und Zustände ab und wird genutzt. Im Log fehlte bisher ein Ereignis für den Wechsel auf eine Ausweichquelle. Ergänzt wurden:

- Kind `data`, Code `fb`: die Antwort kommt von einer Ausweichquelle (Wechsel, nicht jede Abfrage). Meldung: Name der Quelle + "Ausweichquelle".
- Kind `data`, Code `pri`: die Antwort kommt wieder von der ersten Quelle. Meldung: Name + "Hauptquelle".
- Zusammenfassung: Zeile "Ausweichquelle: N× · davon X min Y s" (Anzahl der Wechsel und Zeit auf Ausweichquellen im 24-h-Fenster).

## Felder je Eintrag

Jeder Eintrag hat genau fünf Felder. Text ist bereinigt: keine URLs, Koordinaten, Rufzeichen, Hex-Codes.

| Feld | Bedeutung |
|---|---|
| `t` (Zeit UTC) | ISO-Zeit des Ereignisses, UTC |
| `k` (Art) | `data`, `status`, `net`, `stall`, `error`, `sw`, `boot`, `wake` |
| `c` (Code) | bei `data`: HTTP-Status (z. B. `429`), `0` = ohne Antwort, `ok` = Erfolg nach Ausfall oder erste Antwort, `fb` / `pri` = Quellenwechsel; bei `status`: `online`, `stale`, `offline` |
| `m` (Meldung) | Quellenname (adsb.lol, airplanes.live, OpenSky), Fehlerart (keine Verbindung, Zeitüberschreitung, ungültige Antwort, HTTP …), Retry-After in Sekunden |
| `d` (Zahl) | Millisekunden: bei `data` Dauer der Anfrage (Fehler) oder Lücke seit der letzten Antwort (`ok`); bei `status` Alter der Daten; bei `stall` Frame-Lücke. `null`, wenn nicht zutreffend |

## Kennzahlen des Wochenberichts

| Kennzahl | Berechnung aus dem Export |
|---|---|
| Ausfallzeit gesamt | Summe der `d`-Werte der `data ok`-Einträge mit "wieder da" (Lücke seit der letzten Antwort). Nur Näherung: Lücken am Anfang einer Ausführung oder nach Neustart fehlen. |
| Längste Lücke | größter `d`-Wert bei `data ok` oder bei `status` (ohne `online`) |
| Häufigste Fehler | Anzahl der `data`-Einträge mit Code ungleich `ok`, `fb`, `pri`, gruppiert nach Code und Meldung |
| Anteil der Fallbacks | Summe der Zeit zwischen `fb` und dem nächsten `pri` (bzw. Exportzeit), geteilt durch die Berichtszeit. Die Zusammenfassung zeigt das nur für 24 h. |
| Ausfälle der Anzeige | Anzahl `status offline`-Einträge und `status stale`-Einträge |
| Netz und Fehler | `net offline`-Einträge, `error`-Einträge (Dateiname und Zeile, keine Daten) |

## Wie der Bericht entsteht

1. Auf der Einrichtungsseite unter "Erweitert" das Diagnoseprotokoll herunterladen (Klick nötig; `?diag=export` öffnet nur den Abschnitt).
2. Die Datei ist Klartext. Zeilen mit `Zeit (UTC)` als Kopf, dann eine Zeile je Ereignis. Jede Zeile beginnt mit dem ISO-Zeitstempel. Zeilen mit `[d=…]` am Ende haben einen Zahlenwert.
3. Für den Bericht die Zeilen nach Art zählen, z. B. mit `grep` nach `  data ` und nach Code. Die Zusammenfassung oben in der Datei gilt nur für 24 h und ist kein Wochenwert.
4. Ausfallzeiten aus den `[d=…]`-Werten der `data ok`-Zeilen summieren, Ergebnis in Sekunden angeben.

## Wichtige Grenzen (vor dem Bericht lesen)

- **Ein Export reicht nicht für eine Woche.** Das Protokoll behält höchstens 500 Einträge aus 72 Stunden (`MAX_EVENTS`, `KEEP_MS`). Für einen Wochenbericht also mindestens alle 48 Stunden exportieren und die Exporte nach Zeitstempel zusammenführen; Doppelte (gleiche Zeile) entfernen.
- **Die 500-Einträge-Grenze kann bei langen Ausfällen greifen.** Jede fehlgeschlagene Abfrage wird einzeln protokolliert. Bei 5 s Takt entspricht eine Stunde ohne Daten etwa 700 Abfragen; ältere Einträge gehen dann verloren. Der Bericht muss das angeben, wenn der Zeitraum nicht lückenlos ist.
- **Das Protokoll gilt pro Gerät und Browser.** Ein Fernseher, ein Laptop und ein Handy ergeben je eigene Berichte. Der Wochenbericht bezieht sich immer auf ein Gerät.
- **Nur Übergänge.** Erfolge werden nur am Anfang und nach einem Ausfall geschrieben, Fallbacks nur beim Wechsel. Eine Erfolgsquote lässt sich daraus nicht ablesen.
- **Ausfälle vor dem Seitenstart** (z. B. nach Neustart der App) sind nur in dem Maß sichtbar, wie die Seite Fehler protokolliert hat.

## Ausgefüllte Vorlage (leer)

```
Gerät / Browser:        ____________________
Zeitraum (UTC):         ____________ bis ____________
Exporte verwendet:      ____ (Lücke im Zeitraum: ja / nein)
Ausfallzeit gesamt:     ____ s  (Näherung)
Längste Lücke:          ____ s
Fehler nach Code:       HTTP 429: ____ · ohne Antwort (0): ____ · andere: ____
Ausweichquelle:         ____ Wechsel · ____ s (____ % des Zeitraums)
Anzeige offline/veraltet: ____× / ____×
Auffälligkeiten:        ____________________
```
