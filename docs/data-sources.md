# Datenquellen: Verhalten, Fallback, Rate-Limits

Stand: 2026-10-12 · Quelle des Verhaltens: `js/data.js` (`ORDER`, `usable`, `Feed`), `js/config.js` (`provider`, `public`), `api/proxy.js`, `api/radar.js`, `js/weather.js`.

Rate-Limits sind nur benannt, wenn sie im Repo stehen (App-Konstanten oder Proxy-Header). Ein echtes Limit des Anbieters wurde nicht geprüft; es ist überall "unverifiziert".

## Optionen

**`provider`** (`js/config.js`, Standard `auto`): wählt die Flugdatenquelle. Gültige Werte: `adsblol`, `airplaneslive`, `opensky`. Alles andere (inkl. `auto`) fällt auf die Reihenfolge zurück.

**`public`** (`js/config.js`, Standard an, `public=0` schaltet es aus; ungültige Werte gelten als an): erlaubt öffentliche CORS-Proxys (`allorigins.win`, `codetabs.com`) und die Quellen airplanes.live und OpenSky. Dritte sehen dann Anfragen samt gerundetem Standort und IP-Adresse.

## Reihenfolge und Auswahl (`js/data.js`)

- `ORDER = ['adsblol', 'airplaneslive', 'opensky']` ist die Ausweichreihenfolge.
- `usable(k)` ist wahr für `adsblol` immer, für `airplaneslive` und `opensky` nur bei `public` (Standard an).
- Auswahl in `Feed`:
  1. `demo=1` (bzw. ohne Standort): nur `demo`.
  2. `provider=<name>` und die Quelle ist `usable`: nur diese eine Quelle, kein Fallback.
  3. sonst: mit `public` (Standard) die ganze `ORDER`, mit `public=0` nur `adsblol`.
- Ein Fehler springt zur nächsten Quelle in der Liste. Nach 5 Minuten (`PRIMARY_RETRY_MS`) wird wieder die erste Quelle probiert.
- Das Diagnoseprotokoll (`js/diag.js`) loggt Fehlschläge je Abfrage, den Übergang zurück zu "Daten frisch" sowie die Wechsel auf eine Ausweichquelle (`fb`) und zurück (`pri`). Siehe `docs/uptime-report-template.md`.

## Routen je Anbieter

Jede Anfrage läuft über `getJson`: zuerst der eigene Proxy (`api/proxy.js`, Vercel), bei `public` (Standard) danach die öffentlichen Proxys. Ohne eigenen Proxy (`?proxy=off`) und mit `public=0` gibt es keine Flugdatenabfrage. Direkte Abfragen an Flug- und Wetterdienste gibt es nicht (IP und Standort würden sonst direkt beim Anbieter landen). Ausnahme: Routen bei adsb.lol (`/api/0/route/`) gehen direkt, weil der Dienst CORS erlaubt.

Wenn der eigene Proxy 5xx, Netzwerkfehler oder Zeitüberschreitung liefert, wird es nach 1,5 s ein zweites Mal versucht. Bei 429 nicht, sondern erst bei der nächsten regulären Abfrage. `Retry-After` wird bis 120 s berücksichtigt.

## Quellen

| Quelle | Rolle | Standard | Fallback | App-Takt (Mindestabstand) | Rate-Limit-Risiko |
|---|---|---|---|---|---|
| **adsb.lol** (`api.adsb.lol/v2/point/…`) | Flugdaten, Routen | ja (einzige Quelle bei `public=0`) | auf airplanes.live oder OpenSky nur mit `public` (Standard an) | `minPollSec: 2` | Mittel. Limit unverifiziert. Der Proxy-Code nennt 429 als bekannten Fall. Routen: `api/0/route`, Limit unverifiziert. |
| **airplanes.live** (`api.airplanes.live/v2/point/…`) | Flugdaten, Fallback | nein, nur mit `public` (Standard an) | zweite Stelle in `ORDER` | `minPollSec: 2` | Unverifiziert. Die README nennt die Erreichbarkeit über den eigenen Proxy als nicht gegeben. |
| **OpenSky** (`opensky-network.org/api/states/all`) | Flugdaten, Fallback | nein, nur mit `public` (Standard an) | dritte Stelle in `ORDER` | `minPollSec: 30` | Anonym knapp. Die App wartet 30 s zwischen Abfragen. Das Tageskontingent ist unverifiziert. |
| **Demo** | simulierte Daten | bei fehlendem Standort | keiner | `minPollSec: 1` | keins (lokal) |
| **aviationweather.gov** (METAR) | Wetter, Betriebsrichtung | ja, über den eigenen Proxy | keiner (fällt still aus) | App: 10 min (`METAR_MS`) | Unverifiziert. Der Proxy cacht 5 min (`s-maxage=300`). |
| **DWD Radar** (`opendata.dwd.de`, nur `wx=radar`) | Niederschlagsradar | nur mit `wx=radar` | keiner | serverseitig gecacht 120 s | Unverifiziert. Der Proxy cacht 120 s und liefert bei Fehlern bis 900 s alte Daten. |
| **allorigins.win**, **codetabs.com** | öffentliche CORS-Proxys | nein, nur mit `public` (Standard an) | letzte Route in der Liste | — | Drittanbieter. Limits und Nutzungsbedingungen unverifiziert. Sie sehen Standort (auf ca. 1 km gerundet) und IP. |

## Ausfallverhalten (Kurzfassung)

- Schlägt eine Quelle fehl, wird zur nächsten gewechselt; schlagen alle fehl, bleibt der letzte Fehler stehen und das Backoff greift (`pollDelay`: bis 60 s, Retry-After bis 120 s).
- Die App zeigt nach 30 s "Daten N s alt" (Warnung) und nach 120 s "Keine Verbindung" (Fehler). Beides steht in `js/main.js`.
- Flugzeuge bleiben bis 20 s dead-reckoned sichtbar, danach ausgeblendet, nach 60 s entfernt.

## Offene Punkte

- Alle Rate-Limits der Anbieter sind unverifiziert. Vor einer Aussage dazu müssten die Nutzungsbedingungen der einzelnen Dienste gelesen werden.
- Das Protokoll hält höchstens 500 Einträge aus 72 Stunden. Für einen Wochenbericht sind mehrere Exporte nötig (siehe `docs/uptime-report-template.md`).
