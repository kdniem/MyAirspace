# Datenquellen: Verhalten, Fallback, Rate-Limits

Stand: 2026-10-12 · Quelle des Verhaltens: `js/data.js` (`ORDER`, `usable`, `Feed`), `js/config.js` (`provider`, `public`), `api/proxy.js`, `api/radar.js`, `js/weather.js`.

Rate-Limits sind nur benannt, wenn sie im Repo stehen (App-Konstanten oder Proxy-Header). Ein echtes Limit des Anbieters wurde nicht geprüft; es ist überall "unverifiziert".

## Optionen

**`provider`** (`js/config.js`, Standard `auto`): wählt die Flugdatenquelle. Gültige Werte: `adsblol`, `airplaneslive`, `opensky`. Alles andere (inkl. `auto`) fällt auf die Reihenfolge zurück.

**`public`** (`js/config.js`, Standard aus, nur `public=1` schaltet es ein): erlaubt öffentliche CORS-Proxys (`allorigins.win`, `codetabs.com`) und die Quellen airplanes.live und OpenSky. Dritte sehen dann Anfragen samt gerundetem Standort und IP-Adresse.

## Reihenfolge und Auswahl (`js/data.js`)

- `ORDER = ['adsblol', 'airplaneslive', 'opensky']` ist die Ausweichreihenfolge.
- `usable(k)` ist wahr für `adsblol` immer, für `airplaneslive` und `opensky` nur mit `public=1`.
- Auswahl in `Feed`:
  1. `demo=1` (bzw. ohne Standort): nur `demo`.
  2. `provider=<name>` und die Quelle ist `usable`: nur diese eine Quelle, kein Fallback.
  3. sonst: mit `public=1` die ganze `ORDER`, ohne `public=1` nur `adsblol`.
- Ein Fehler springt zur nächsten Quelle in der Liste. Nach 5 Minuten (`PRIMARY_RETRY_MS`) wird wieder die erste Quelle probiert.
- Das Diagnoseprotokoll (`js/diag.js`) loggt Fehlschläge je Abfrage und den Übergang zurück zu "Daten frisch". Ein Wechsel auf eine Ausweichquelle wird nicht protokolliert (siehe `docs/uptime-report-template.md`).

## Routen je Anbieter

Jede Anfrage läuft über `getJson`: zuerst der eigene Proxy (`api/proxy.js`, Vercel), bei `public=1` danach die öffentlichen Proxys. Ohne eigenen Proxy (`?proxy=off`) und ohne `public=1` gibt es keine Flugdatenabfrage. Direkte Abfragen an Flug- und Wetterdienste gibt es nicht (IP und Standort würden sonst direkt beim Anbieter landen). Ausnahme: Routen bei adsb.lol (`/api/0/route/`) gehen direkt, weil der Dienst CORS erlaubt.

Wenn der eigene Proxy 5xx, Netzwerkfehler oder Zeitüberschreitung liefert, wird es nach 1,5 s ein zweites Mal versucht. Bei 429 nicht, sondern erst bei der nächsten regulären Abfrage. `Retry-After` wird bis 120 s berücksichtigt.

## Quellen

| Quelle | Rolle | Standard | Fallback | App-Takt (Mindestabstand) | Rate-Limit-Risiko |
|---|---|---|---|---|---|
| **adsb.lol** (`api.adsb.lol/v2/point/…`) | Flugdaten, Routen | ja (einzige Quelle ohne `public=1`) | auf airplanes.live oder OpenSky nur mit `public=1` | `minPollSec: 2` | Mittel. Limit unverifiziert. Der Proxy-Code nennt 429 als bekannten Fall. Routen: `api/0/route`, Limit unverifiziert. |
| **airplanes.live** (`api.airplanes.live/v2/point/…`) | Flugdaten, Fallback | nein, nur `public=1` | zweite Stelle in `ORDER` | `minPollSec: 2` | Unverifiziert. Die README nennt die Erreichbarkeit über den eigenen Proxy als nicht gegeben. |
| **OpenSky** (`opensky-network.org/api/states/all`) | Flugdaten, Fallback | nein, nur `public=1` | dritte Stelle in `ORDER` | `minPollSec: 30` | Anonym knapp. Die App wartet 30 s zwischen Abfragen. Das Tageskontingent ist unverifiziert. |
| **Demo** | simulierte Daten | bei fehlendem Standort | keiner | `minPollSec: 1` | keins (lokal) |
| **aviationweather.gov** (METAR) | Wetter, Betriebsrichtung | ja, über den eigenen Proxy | keiner (fällt still aus) | App: 10 min (`METAR_MS`) | Unverifiziert. Der Proxy cacht 5 min (`s-maxage=300`). |
| **DWD Radar** (`opendata.dwd.de`, nur `wx=radar`) | Niederschlagsradar | nur mit `wx=radar` | keiner | serverseitig gecacht 120 s | Unverifiziert. Der Proxy cacht 120 s und liefert bei Fehlern bis 900 s alte Daten. |
| **allorigins.win**, **codetabs.com** | öffentliche CORS-Proxys | nein, nur `public=1` | letzte Route in der Liste | — | Drittanbieter. Limits und Nutzungsbedingungen unverifiziert. Sie sehen Standort (auf ca. 1 km gerundet) und IP. |

## Ausfallverhalten (Kurzfassung)

- Schlägt eine Quelle fehl, wird zur nächsten gewechselt; schlagen alle fehl, bleibt der letzte Fehler stehen und das Backoff greift (`pollDelay`: bis 60 s, Retry-After bis 120 s).
- Die App zeigt nach 30 s "Daten N s alt" (Warnung) und nach 120 s "Keine Verbindung" (Fehler). Beides steht in `js/main.js`.
- Flugzeuge bleiben bis 20 s dead-reckoned sichtbar, danach ausgeblendet, nach 60 s entfernt.

## Offene Punkte

- Alle Rate-Limits der Anbieter sind unverifiziert. Vor einer Aussage dazu müssten die Nutzungsbedingungen der einzelnen Dienste gelesen werden.
- Ein Wechsel der Quelle ist im Log nur als Fehler sichtbar, nicht als Ereignis. Siehe `docs/uptime-report-template.md`.
