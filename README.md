# MyAirspace

Ein ruhiges Live-Flugradar im Look echter Luftfahrt-Anzeigen für den Fernseher. Dein Standort ist in der Mitte, um dich herum siehst du die Flugzeuge als ATC-Symbole mit Verlaufspunkten und Datenblock, die Pisten von Hamburg (EDDH) und Finkenwerder (EDHI) mit Bezeichnern und Anfluglinien, außen eine Kompassrose, und unten eine Tafel mit dem Flugzeug, das dir gerade am nächsten ist. Sieben Stile (ATC, Terminal, Karte, Airbus, Boeing, Nacht, Militär) und viele Optionen machen die Anzeige persönlich.

Die App ist nur zum Anschauen gedacht: URL öffnen, fertig. Es gibt keine Bedienung, keinen API-Key und keinen Build-Schritt.

## Einrichten

Am einfachsten auf dem Handy: **[setup.html](https://kdniem.github.io/MyAirspace/setup.html)** öffnen. Dort wählst du deinen Standort (per GPS, Ortssuche oder einen der Flughäfen mit Karte), stellst Radius, Einheiten, Spuren und Nachtdimmen ein und siehst sofort eine Vorschau. Am Ende bekommst du die fertige Adresse für den Fernseher zum Kopieren, Öffnen oder als QR-Code. Der Standort wird standardmäßig auf etwa 1 km gerundet. Beim ersten Besuch führt ein Assistent in fünf Schritten durch Standort, Stil, Feinschliff und die Adresse für den Fernseher (`setup.html?wizard=1` startet ihn erneut, `wizard=0` blendet ihn aus). Die Seite speichert nur den Merker, dass du fertig bist, nichts weiter; die Ortssuche nutzt Nominatim von OpenStreetMap.

Öffnest du die TV-Seite ohne Standort, zeigt sie 45 Sekunden ein Willkommensfeld mit QR-Code zur Einrichtungsseite. Mit Standort erscheint einmalig pro Gerät kurz ein „Alles bereit“-Hinweis.

**Als App:** Die Seite hat ein Web-App-Manifest. Auf iPad/iPhone in Safari *Teilen → Zum Home-Bildschirm*, auf Android *Zum Startbildschirm hinzufügen*. Die App startet im Vollbild mit deinen zuletzt geöffneten Einstellungen. Ein kleiner Service Worker (`sw.js`) hält nur die App-Dateien offline vor, nie Flugdaten.

## Aufrufen

```
https://<dein-github-name>.github.io/MyAirspace/?lat=53.5511&lon=9.9937&label=Hamburg
```

Deine Koordinaten stehen nur in der URL, nicht im Code. Setz sie einmal als Lesezeichen bzw. Startseite im TV-Browser.

| Parameter  | Standard        | Bedeutung |
|------------|-----------------|-----------|
| `lat`, `lon` | Hamburg-Zentrum | Dein Standort (Dezimalgrad, z. B. aus Google Maps per Rechtsklick) |
| `r`        | `25`            | Radius des Hauptrings in km |
| `label`    | `Hamburg`       | Ortsname oben links |
| `units`    | `ft`            | Höhenangaben in `ft` oder `m` |
| `poll`     | `5`             | Abfrageintervall in Sekunden |
| `rotate`   | `9`             | Sekunden pro Flugzeug auf der Tafel (sie wechselt durch die vier nächsten) |
| `trail`    | `4`             | Länge der Flugspuren in Minuten |
| `night`    | `23-6`          | Zeitraum, in dem gedimmt wird (`off` schaltet das Dimmen aus) |
| `dim`      | `0.45`          | Helligkeit während der Nachtzeit |
| `title`    | –               | Zweite Zeile unter dem Ortsnamen, z. B. `Zuhause` |
| `style`    | `atc`           | Stil: `atc`, `terminal`, `chart`, `airbus`, `boeing`, `night`, `military` (ungültig = `atc`), siehe [Stile](#stile-und-optionen) |
| `theme`    | je Stil         | `dark`, `light` oder `auto` (hell von Sonnenauf- bis -untergang am Standort, sonst dunkel). Standard ist der Stil-Standard: `dark`, bei `chart` `light` |
| `accent`   | je Stil         | Akzentfarbe: `amber`, `green`, `cyan`, `white`, `red` oder Hex wie `ff8800` (wird bei Bedarf aufgehellt/abgedunkelt, damit es lesbar bleibt) |
| `font`     | je Stil         | `mono` (IBM Plex Mono) oder `sans` (Helvetica/Arial), beide mit tabellarischen Ziffern |
| `brightness` | `1`           | Helligkeit von Karte, Ringen und Wasser, 0,5 bis 1,2 |
| `datablock` | `callsign,fl,gs,type` | Felder des Datenblocks in dieser Reihenfolge: `callsign`, `fl` (Höhe), `gs` (Speed), `type`, `route`, `reg`. `datablock=0` blendet ihn aus |
| `show`, `hide` | alles an     | Elemente: `weather`, `labels` (auch `datablock`), `trails`, `rings`, `places`, `board`, `clock`, `ground`, `compass`. `show=rings,clock` zeigt nur diese, `hide=board,compass` blendet sie aus |
| `labels`, `places`, `weather`, `rings`, `compass`, `ground`, `board`, `clock`, `trails` | `1` | Einzelschalter je Element (`0` = aus; `trails=0` entspricht `trail=0`) |
| `speed`    | `kt`            | Geschwindigkeit in `kt` oder `kmh` |
| `pressure` | `hpa`           | QNH in `hpa` oder `inhg` |
| `time`     | `both`          | `local` (Lokalzeit), `utc` oder `both` (Lokalzeit groß, darunter UTC mit Z) |
| `orient`   | `north`         | Nur `north` (Norden oben). Ein „Track up“-Modus ist nicht gebaut |
| `proxy`    | –               | Nur `off` oder der eigene Proxy erlaubt, siehe [Proxy](#proxy-cors) |
| `public`   | `0`             | `1` erlaubt öffentliche CORS-Proxys und die Quellen airplanes.live/OpenSky (Datenschutz beachten) |
| `provider` | `auto`          | Datenquelle festlegen: `adsblol`; `airplaneslive`, `opensky` nur mit `public=1` |
| `demo`     | `0`             | `1` zeigt simulierten Hamburger Verkehr (zum Ausprobieren ohne Netz) |
| `view`     | `auto`          | `auto` wechselt zwischen Radar und Anzeigetafel, `radar` bzw. `board` zeigt nur eine Ansicht |
| `radarsec` | `240`           | Sekunden Radar, bevor die Anzeigetafel kommt (bei `view=auto`) |
| `boardsec` | `40`            | Sekunden Anzeigetafel, danach wieder Radar (bei `view=auto`) |

## Stile und Optionen

Alle Looks sind Daten: die Tabelle `STYLES` in `js/styles.js` hält je Stil Rollenfarben für Dunkel und Hell, Symbolform, Spurart, Schrift und ein paar CSS-Variablen. `js/theme.js` setzt daraus die CSS-Variablen auf `<html>`, `js/radar.js` zeichnet mit denselben Rollen. Ein neuer Stil ist ein neuer Eintrag in der Tabelle (die Einrichtungsseite baut ihre Auswahl daraus). Farben folgen Cockpit-Regeln: **Weiß** normale Daten, **Grün** aktiv (Piste in Betrieb, Akzent), **Cyan** das gewählte Flugzeug (Ziel), **Bernstein** Vorsicht, **Rot** Warnung (Notfall-Squawk), **Magenta** besondere Flugzeuge. Dazu keine Dekorfarben.

| Stil | Look | Standard |
|------|------|----------|
| `atc` | Tower-Radarschirm: dunkles Phosphorgrün, Chevron-Symbole, Verlaufspunkte | dunkel |
| `terminal` | Anzeigetafel (FIDS): Dunkelblau mit Gelb, Sans, eckige Tafel | dunkel |
| `chart` | Luftfahrtkarte: Papier und Tinte, Dreiecke, Flughäfen in Magenta | hell |
| `airbus` | ND + ECAM: Schwarz, Grün für Werte, Cyan für Einheiten, Rauten, dünne Linien | dunkel |
| `boeing` | ND + EICAS: bläuliche Grautöne, kräftigere Schrift, Pfeilsymbole | dunkel |
| `night` | Sehr dunkel, nur Rot und Dunkelgrün, blendfrei fürs abgedunkelte Wohnzimmer | nur dunkel |
| `military` | Taktische Anzeige in gedämpftem Oliv | nur dunkel |

**Radar:** Flugzeuge sind Positionssymbole mit Verlaufspunkten (alle 15 s; bei Airbus/Boeing/Terminal eine dünne Spur) und einem Datenblock an einer Hilfslinie: Rufzeichen, Höhe als Flugfläche (`FL120` ab 5000 ft) oder in Hundertfuß (`038`), Pfeil für Steigen/Sinken, Ground Speed in kt, Muster. Die Blöcke weichen einander aus. Besondere Flugzeuge (siehe unten) bekommen eine dezente Eckenklammer in Magenta (Notfall rot, blinkend), keinen Schein. Das gewählte Flugzeug ist cyan mit Rahmen, Peil- und Entfernungslinie und einer Marke auf der Kompassrose. Die Karte zeigt Pisten mit Bezeichnern (05/23), Schwellenstrichen und Anfluglinien (die Piste in Betrieb in Grün), den Flughafen als Kreis mit Pistenkreuz und ICAO-Code, Entfernungsringe und außen eine Kompassrose (Strich alle 5°, Beschriftung alle 30°, N/E/S/W, Nordpfeil).

**Kopfzeile:** Ortsname (optional mit zweiter Zeile `title`), Lokalzeit (LT), UTC mit Z, Zahl der Flugzeuge, kompakter METAR (`EDDH 120820Z 23012G22KT 9999 … Q1013`), QNH und die Piste in Betrieb (`RWY 23`).

**Tafel:** Die untere Tafel zeigt FLUG, ROUTE, TYP, ALT (ab 5000 ft als Flugfläche mit `STD`), GS, DIST. Die Anzeigetafel (Überflüge) nutzt Zebrazeilen, Kopfband und die Flip-Animation. `node tools/contrast.mjs` prüft alle Stile in Dunkel und Hell mit allen Akzentfarben (WCAG, Text mindestens 4,5:1), eigene Hex-Akzente werden automatisch bis dahin angepasst. `node tools/tests/options.cjs .` testet die URL-Optionen.

Die Einrichtungsseite hat dafür die Abschnitte Theme, Anzeige, Einheiten und Elemente mit Live-Vorschau (`setup.html?demo=1` zeigt in der Vorschau den Demo-Verkehr). Die Einstellungen stehen in der Adresse und werden von `js/pwa.js` wie alle Parameter für die Home-Bildschirm-App gemerkt.

Für die Lesbarkeit aus drei Metern Abstand sind Schriften größer (nichts Wichtiges unter etwa 1,6 vh) und alle Texte haben mindestens 4,5:1 Kontrast.

## Anzeigetafel

Alle paar Minuten blendet die App für eine Weile eine zweite Ansicht im Stil einer Abflugtafel ein: die zehn letzten Flugzeuge, die durch den Radius (`r`) geflogen sind, mit Uhrzeit der größten Annäherung, Route, Höhe, kleinster Entfernung und Landung/Start/Überflug, darunter die Tagesstatistik (Überflüge, häufigste Airline und häufigstes Muster, tiefster und nächster Überflug, größtes Flugzeug). Das Protokoll liegt nur im Browser (`localStorage`, je Kalendertag, die letzten zwei Tage) und verlässt das Gerät nicht.

## Auf dem Fernseher

- **Smart-TV (Samsung, LG, Android TV, Fire TV):** Die URL im eingebauten Browser öffnen und als Lesezeichen speichern. Mit Vollbild bzw. ausgeblendeter Adressleiste sieht es am besten aus.
- **Apple TV:** tvOS hat keinen Webbrowser. Öffne die URL in Safari auf dem Mac, iPad oder iPhone, schalte Safari auf Vollbild und spiegle den Bildschirm per AirPlay auf den Apple TV. Auf dem iPhone/iPad kannst du die Seite auch über *Teilen → Zum Home-Bildschirm* als Vollbild-App speichern.
- Wo der Browser es kann (Wake Lock API), verhindert die Seite, dass der Bildschirm ausgeht. Gegen Einbrennen auf OLED-Fernsehern verschiebt sich das ganze Bild alle zwei Minuten um ein paar Pixel.

## Flugzeuge am Boden

Flugzeuge am Boden werden an den Flughäfen der Karte (bis 4 km um den Flughafen) als kleine Quadrate mit Kursstrich angezeigt (`ground=0` blendet sie aus), die Kopfzeile nennt die Zahl („3 am Boden“). Sie erscheinen nie auf der Tafel.

## Vollbild am Computer

Wenn du das Dashboard am Computer im Browser offen hast: Maus bewegen, dann erscheint links der Knopf „Vollbild“. Alternativ schaltet die Taste **F** oder ein Doppelklick um, **Esc** beendet das Vollbild. Auf dem Fernseher und in installierten Apps gibt es den Knopf nicht.

## Daten

- **adsb.lol** (Standard, einzige Quelle ohne `public=1`): offene ADS-B-Daten unter ODbL, ohne Key. Von hier kommen auch die Routen (z. B. `MUC → HAM`).
- **airplanes.live** und **OpenSky Network**: nur mit `?public=1` (Ersatz, wenn adsb.lol nicht antwortet; OpenSky anonym höchstens alle 30 s). Über den eigenen Proxy funktionieren sie nicht.

Mit `public=1` nimmt die App bei einem Ausfall automatisch die nächste Quelle und versucht es nach fünf Minuten wieder mit der ersten. Zwischen zwei Abfragen werden die Positionen anhand von Kurs und Geschwindigkeit weitergerechnet, deshalb bewegen sich die Flugzeuge flüssig. Bei kurzen Ausfällen bleiben die zuletzt bekannten Flugzeuge sichtbar (bis zu 20 s weitergerechnet, nach 60 s ausgeblendet).

### Proxy (CORS)

adsb.lol und die METAR-Quelle erlauben keine Abfragen direkt aus dem Browser (CORS). Die App leitet die Abfragen deshalb über einen eigenen Proxy:

- **Eigener Proxy auf Vercel** unter `https://myairspace-nu.vercel.app/api/proxy` ([`api/proxy.js`](api/proxy.js), `DEFAULT_PROXY` in `js/pwa.js`). Vercel deployt jeden Push auf `main` automatisch. Fällt der Proxy aus (429, 5xx, Netzwerk), versucht die App es nach 1,5 s einmal erneut. Einrichtung bei einem neuen Konto:
  1. Auf [vercel.com](https://vercel.com) mit **Continue with GitHub** anmelden.
  2. **Add New → Project**, das Repo `kdniem/MyAirspace` importieren, Framework **Other**, nichts weiter einstellen, **Deploy**.
  3. Die Adresse `https://<projekt>.vercel.app/api/proxy` in `js/pwa.js` als `DEFAULT_PROXY` eintragen.
- `?proxy=` wird nur akzeptiert, wenn der Wert `DEFAULT_PROXY` ist, `off` (kein Proxy, nur direkte Abfragen; die schlagen meist an CORS fehl) oder eine `https://…vercel.app/api/proxy`-Adresse auf dem Host des eigenen Projekts. Alles andere wird ignoriert.
- **Routen** (`MUC → HAM`) fragt die App direkt bei adsb.lol ab, dieser Endpunkt erlaubt Browser-Abfragen; der eigene Proxy ist der Rückfall.
- **Opt-in `?public=1`:** zusätzlich werden die öffentlichen CORS-Proxys `allorigins.win` und `codetabs.com` sowie die Quellen airplanes.live und OpenSky benutzt. Datenschutzhinweis: Diese Dritten sehen dann jede Abfrage samt (auf etwa 1 km gerundetem) Standort und deiner IP-Adresse. Die App zeigt es in der Fußzeile an („öffentliche Proxys“) und merkt sich die gewählte Route nicht dauerhaft.
- Ein Cloudflare Worker eignet sich **nicht** als Proxy: adsb.lol drosselt Anfragen aus Cloudflare Workers (429), airplanes.live verlangt eine Registrierung (403), OpenSky ist nicht erreichbar (522). Stand Oktober 2026.

**Sicherheit des Proxys:** Er erlaubt nur `https` ohne Port und ohne Zugangsdaten in der Adresse, nur diese Host-/Pfad-Paare, alles andere ergibt 403:

| Host | Pfad |
|------|------|
| `api.adsb.lol` | `/v2/point/…`, `/api/0/route/…` |
| `api.airplanes.live` | `/v2/point/…` |
| `opensky-network.org` | `/api/states/all` |
| `aviationweather.gov` | `/api/data/metar` |

Weitere Schutzmaßnahmen: nur die Herkunft `kdniem.github.io`, `myairspace-nu.vercel.app` und `localhost`/`127.0.0.1` (Entwicklung); Weiterleitungen des Ziels werden nicht verfolgt; Antworten müssen gültiges JSON sein und werden immer als `application/json` mit `nosniff` und strenger CSP ausgeliefert (Fehler nie als HTML); Fehlerantworten enthalten keinen Inhalt des Ziels; Koordinaten in `/v2/point/` werden serverseitig auf 2 Nachkommastellen gerundet und der Radius auf 250 nm begrenzt. Die App schickt den Standort ohnehin nur auf etwa 1 km gerundet ab. Rechtliches: [LICENSE](LICENSE), [THIRD_PARTY.md](THIRD_PARTY.md), [datenschutz.html](datenschutz.html).

### Verbindung & Ausfälle

adsb.lol drosselt die gemeinsame Vercel-Adresse gelegentlich (HTTP 429). Damit der Fernseher dann nicht leer wird:

- **Proxy:** Antworten für `/v2/point` gelten 3 s als frisch, danach liefert das CDN bis zu 30 s die letzte gute Antwort weiter und holt im Hintergrund eine neue (`stale-while-revalidate=30`); bei Fehlern des Ziels zusätzlich bis 120 s (`stale-if-error=120`). Fehlerantworten (429, 5xx) werden nie zwischengespeichert; ein `Retry-After` des Ziels (nur Sekunden, höchstens 120) gibt der Proxy weiter.
- **App, Abfragetakt:** Bei Fehlern wird der Takt schrittweise langsamer (bis 60 s, nie kürzer als `Retry-After`, höchstens 120 s), nach einer Wiederherstellung kehrt er in wenigen Schritten zum normalen Takt zurück. Anzeige und Status setzen sich sofort zurück, sobald wieder Daten kommen.
- **App, Anzeige:** Bis zu 20 s ohne neue Daten werden Flugzeuge weitergerechnet, danach blenden sie über etwa 40 s langsam aus. Die Statuszeile unter der Uhr zeigt das Alter der Daten selbst (auch wenn eine Antwort aus dem Cache kommt): unter 30 s normal, ab 30 s gelb „Daten 45 s alt“, ab 2 min rot „Keine Verbindung · Daten 3 min alt“. Ohne Flugzeuge steht auf der Tafel „OFFLINE“ statt eines leeren Bildes.

Steigen und Sinken zeigt der Pfeil im Datenblock (↑ ↓). Überflüge oberhalb von FL200 sind abgedunkelt. Airbus-Sonderflüge (Beluga, Testflüge `AIB…`) bekommen auf der Tafel ein eigenes Abzeichen.

### Karten

Fertige Karten gibt es für Hamburg (HAM, XFW), Frankfurt (FRA), Münster/Osnabrück (FMO) und Kopenhagen (CPH):

- Frankfurt: `https://kdniem.github.io/MyAirspace/?lat=50.0333&lon=8.5706&r=25&label=Frankfurt`
- Münster/Osnabrück: `https://kdniem.github.io/MyAirspace/?lat=52.1346&lon=7.6848&r=25&label=FMO`
- Kopenhagen: `https://kdniem.github.io/MyAirspace/?lat=55.6181&lon=12.6561&r=25&label=Kopenhagen`

Die Pisten stammen aus [OurAirports](https://ourairports.com), Flüsse und Küsten außerhalb Hamburgs aus [Natural Earth](https://www.naturalearthdata.com) (beide gemeinfrei). Elbe, Alster und die Orte sind von Hand eingetragen. `data/geo-features.js` wird mit `python3 tools/build-geo.py` erzeugt; weitere Flughäfen ergänzt man dort in `AIRPORTS`, `AREAS` und `AREA_PLACES`. Die Karte ist absichtlich vereinfacht und taugt nicht zur Navigation.

### Routen

Die Route (z. B. `NCE → HAM`) kommt aus der Routendatenbank von adsb.lol. Bei Umläufen wie `HAM-NCE-HAM` zeigt die App nur den Abschnitt, den das Flugzeug gerade fliegt: Ausschlaggebend sind Position, Kurs und Steig- oder Sinkflug. „Anflug“ bzw. „Abflug“ erscheint bei Flughäfen bis 60 km vom Standort. Für Privatflieger, Hubschrauber und manche Charterflüge kennt die Datenbank keine Route.

## Veröffentlichen (GitHub Pages)

1. Im Repository unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** wählen.
2. Jeder Push auf `main` veröffentlicht die Seite über `.github/workflows/pages.yml`.

## Lokal ausprobieren

```
python3 -m http.server 8000
# http://localhost:8000/?demo=1
```

## Tests

```
node tools/tests/run-all.mjs        # alles (oder: npm test), ca. 2 Minuten
node tools/tests/run-all.mjs --quick --no-browser   # nur schnelle Prüfungen
```

Die Tests brauchen keine Abhängigkeiten, nur die Browser-Suite braucht Playwright mit Chromium (`PLAYWRIGHT_PATH` zeigt auf das Paket, falls es nicht normal auffindbar ist). Reihenfolge: Syntax (`node --check`), URL-Optionen und ES2017-Prüfung (`options.cjs`), Alt-Browser-Wächter (`compat.mjs`: keine neuere Syntax, keine neueren APIs und kein neueres CSS auf der TV-Seite), Kontrast, Proxy, Browser-Suite. Die Browser-Suite (`browser.mjs`) lädt jeden Stil, jedes Theme, drei Auflösungen und beide Ansichten im Demo-Modus, blockiert alle Fremdzugriffe und prüft Konsolenfehler, Überlappungen in der Kopfzeile, abgeschnittenen Text, leere Karte, Kontrast, die Einrichtungsseite samt Vorschau sowie feindliche URL-Parameter. Bilder fehlgeschlagener Prüfungen und der Bericht liegen in `tools/tests/out/`. Bekannte, noch nicht behobene Befunde stehen in `tools/tests/known-issues.json` (werden gemeldet, brechen den Lauf aber nicht ab). Auf GitHub läuft alles bei jedem Pull Request und jedem Push außerhalb von `main` (`.github/workflows/ci.yml`).

## Aufbau

```
index.html             Layout (Karte, Kopfzeile, Tafel)
setup.html             Einrichtungsseite (css/setup.css, js/setup.js, js/qr.js)
manifest.webmanifest   Web-App-Manifest, Icons in icons/ (tools/build-icons.mjs)
sw.js                  Service Worker: App-Dateien offline, network-first
css/style.css          Textrollen (Label, Wert, Einheit), Layout, TV-Sicherheitsrand; Farben kommen als CSS-Variablen aus js/styles.js
tools/contrast.mjs     Kontrastprüfung (WCAG) für alle Stile, Themes und Akzentfarben
tools/tests/           run-all.mjs (alles), browser.mjs, compat.mjs, options.cjs, poll-test.cjs (Abfragetakt), proxy-test.mjs, motion-sim.js
data/geo-features.js   Pisten, Gewässer, Orte (erzeugt von tools/build-geo.py)
tools/build-geo.py     Generator für die Kartendaten
api/proxy.js           CORS-Proxy als Vercel Function (Host-/Pfad-Allowlist)
js/pwa.js              Home-Bildschirm-App: letzte Einstellungen wiederherstellen; DEFAULT_PROXY
js/styles.js           STYLES-Tabelle: Rollenfarben je Stil und Theme, Symbole, Schrift (Daten, keine Logik pro Stil)
js/config.js           URL-Parameter
js/theme.js            Dunkel/Hell/Automatisch (Sonnenstand), setzt data-theme und die Stil-Variablen vor dem ersten Bild
js/hint.js             Hinweis auf setup.html, wenn kein Standort in der URL steht
js/data.js             Datenquellen, Fallback, Routen-Cache
js/demo.js             Simulierter Verkehr für ?demo=1
js/radar.js            Canvas-Karte: Kompassrose, Pisten, ATC-Symbole, Datenblöcke
js/board.js            Tafel mit Split-Flap-Effekt
js/main.js             Abfrage-Schleife, Glättung, Rotation, Dimmen, Wake Lock
```

Alles ist reines JavaScript ohne Framework und läuft auch in älteren TV-Browsern.
