# MyAirspace

Ein ruhiges Live-Flugradar im Look echter Luftfahrt-Anzeigen für den Fernseher. Dein Standort ist in der Mitte, um dich herum siehst du die Flugzeuge als Flugzeug-Silhouetten mit auslaufender Flugspur und Datenblock, die Pisten von Hamburg (EDDH) und Finkenwerder (EDHI) mit Bezeichnern und Anfluglinien, außen eine Kompassrose, und unten eine Tafel mit dem Flugzeug, das dir gerade am nächsten ist. Sieben Stile (ATC, Terminal, Karte, Airbus, Boeing, Nacht, Militär) und viele Optionen machen die Anzeige persönlich.

Die App ist nur zum Anschauen gedacht: URL öffnen, fertig. Es gibt keine Bedienung, keinen API-Key und keinen Build-Schritt.

## Einrichten

Am einfachsten auf dem Handy: **[setup.html](https://kdniem.github.io/MyAirspace/setup.html)** öffnen. Die Einrichtung führt in fünf Schritten durch alles, mehr dazu unten im Abschnitt [Einrichtungs-Assistent](#einrichtungs-assistent). Am Ende bekommst du die fertige Adresse für den Fernseher zum Kopieren, Öffnen oder als QR-Code. Der Standort wird standardmäßig auf etwa 1 km gerundet. Die Seite speichert nichts dauerhaft; die Ortssuche nutzt Nominatim von OpenStreetMap.

Öffnest du die TV-Seite ohne Standort, zeigt sie ein ruhiges Willkommensbild mit QR-Code zur Einrichtungsseite, darunter laufen die Beispielflugzeuge weiter. Das Bild bleibt, bis ein Standort in der Adresse steht. Mit Standort erscheint einmalig pro Gerät kurz ein „Alles bereit“-Hinweis.

**Als App:** Die Seite hat ein Web-App-Manifest. Auf iPad/iPhone in Safari *Teilen → Zum Home-Bildschirm*, auf Android *Zum Startbildschirm hinzufügen*. Die App startet im Vollbild mit deinen zuletzt geöffneten Einstellungen. Ein kleiner Service Worker (`sw.js`) hält nur die App-Dateien offline vor, nie Flugdaten.

## Hinweise

- **Keine Navigation:** MyAirspace ist eine Anzeige für Neugier und Ambiente. Es ist kein Navigations‑, Flugsicherungs‑ oder Sicherheitsinstrument und darf dafür nicht verwendet werden.
- **Stilnamen:** Die Stile `airbus` und `boeing` sind nur optische Vorbilder. Sie stehen in keiner Verbindung zu Airbus oder Boeing, deren Namen und Marken gehören den jeweiligen Firmen.

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
| `rotate`   | `20`            | Sekunden pro Flugzeug auf der Tafel (sie wechselt ruhig durch die vier nächsten, siehe [Tafel-Auswahl](#tafel-auswahl)) |
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
| `show`, `hide` | alles an     | Elemente: `weather`, `labels` (auch `datablock`), `trails`, `rings`, `places`, `board`, `clock`, `ground`, `compass`, `logos`. `show=rings,clock` zeigt nur diese, `hide=board,compass` blendet sie aus |
| `chartbg` | aus | Luftfahrtkarte als Hintergrund: Lufträume, Funkfeuer, Hindernisse, Gradnetz im Papierlook (`chartbg=1`, siehe unten). Nur Schalter, keine Verbindung nach außen |
| `labels`, `places`, `weather`, `rings`, `compass`, `ground`, `board`, `clock`, `trails`, `logos` | `1` | Einzelschalter je Element (`0` = aus; `trails=0` entspricht `trail=0`) |
| `speed`    | `kt`            | Geschwindigkeit in `kt` oder `kmh` |
| `pressure` | `hpa`           | QNH in `hpa` oder `inhg` |
| `time`     | `both`          | `local` (Lokalzeit), `utc` oder `both` (Lokalzeit groß, darunter UTC mit Z) |
| `orient`   | `north`         | Nur `north` (Norden oben). Ein „Track up“-Modus ist nicht gebaut |
| `proxy`    | –               | Nur `off` oder der eigene Proxy erlaubt, siehe [Proxy](#proxy-cors) |
| `public`   | `0`             | `1` erlaubt öffentliche CORS-Proxys und die Quellen airplanes.live/OpenSky (Datenschutz beachten) |
| `provider` | `auto`          | Datenquelle festlegen: `adsblol`; `airplaneslive`, `opensky` nur mit `public=1` |
| `view`     | `auto`          | `auto` wechselt nach `views` (Standard Radar und Tafel). `radar`, `board` oder `airport` zeigt nur diese eine Ansicht (`airport`: die Flughafen-Ansicht, ohne Standort nutzbar) |
| `views`    | `radar,board`   | Reihenfolge der Wechsel-Ansichten bei `view=auto`, z. B. `radar,board,airport`. Eine Ansicht darf doppelt stehen, um sie zu gewichten (`radar,radar,board,airport`). Unbekannte Namen fallen weg; eine leere oder einelementige Liste ergibt die Voreinstellung `radar,board` |
| `airport` | `HAM`         | Flughafen der Flughafen-Ansicht (`airport` in `views` oder `view=airport`): `HAM`, `XFW`, `FRA`, `FMO` oder `CPH`; alles andere ergibt `HAM`, siehe [Flughafen-Ansicht](#flughafen-ansicht) |
| `demo`     | `0`             | `1` zeigt simulierten Hamburger Verkehr (zum Ausprobieren ohne Netz); mit `wx=radar` auch simulierten Regen, gekennzeichnet als DEMO |
| `wx`       | aus             | `radar` blendet das Wetterradar über der Karte ein (Niederschlag in Cockpit-Farben, nur Deutschland), siehe [Wetterradar](#wetterradar) |
| `radarsec` | `240`           | Sekunden pro Radar-Abschnitt im Wechsel (10 bis 3600) |
| `boardsec` | `40`            | Sekunden pro Tafel-Abschnitt im Wechsel (5 bis 600); eine Tafel wird übersprungen, solange noch kein Überflug da war |
| `airportsec` | `60`          | Sekunden pro Flughafen-Abschnitt im Wechsel (10 bis 3600) |

## Stile und Optionen

Alle Looks sind Daten: die Tabelle `STYLES` in `js/styles.js` hält je Stil Rollenfarben für Dunkel und Hell, Symbolgröße, Spurbreite, Schrift und ein paar CSS-Variablen. `js/theme.js` setzt daraus die CSS-Variablen auf `<html>`, `js/radar.js` zeichnet mit denselben Rollen. Ein neuer Stil ist ein neuer Eintrag in der Tabelle (die Einrichtungsseite baut ihre Auswahl daraus). Farben folgen Cockpit-Regeln: **Weiß** normale Daten, **Grün** aktiv (Piste in Betrieb, Akzent), **Cyan** das gewählte Flugzeug (Ziel), **Bernstein** Vorsicht, **Rot** Warnung (Notfall-Squawk), **Magenta** besondere Flugzeuge. Dazu keine Dekorfarben.

| Stil | Look | Standard |
|------|------|----------|
| `atc` | Tower-Radarschirm: dunkles Phosphorgrün, Flugzeug-Silhouetten, auslaufende Spur | dunkel |
| `terminal` | Anzeigetafel (FIDS): Dunkelblau mit Gelb, Sans, eckige Tafel | dunkel |
| `chart` | Luftfahrtkarte: Papier und Tinte, dunkle Tinte, Flughäfen in Magenta | hell |
| `airbus` | ND + ECAM: Schwarz, Grün für Werte, Cyan für Einheiten, dünne Linien | dunkel |
| `boeing` | ND + EICAS: bläuliche Grautöne, kräftigere Schrift, runde Kacheln | dunkel |
| `night` | Sehr dunkel, nur Rot und Dunkelgrün, blendfrei fürs abgedunkelte Wohnzimmer | nur dunkel |
| `military` | Taktische Anzeige in gedämpftem Oliv | nur dunkel |

**Radar:** Flugzeuge sind Silhouetten von oben (Schmalrumpf, Großraum, Jumbo, Regionaljet, Business-Jet, Turboprop, Leichtflugzeug, Hubschrauber, Kampfflugzeug; gewählt nach dem ICAO-Typ, `js/glyphs.js`), in Rollenfarbe gefüllt und mit dünner Kontur in der Kartenfarbe, in Flugrichtung gedreht. Dahinter läuft die Flugspur als durchgehende, sich verjüngende Linie aus, die zum Ende hin vollständig ausblendet (Länge: `trail`), und davor steht ein Datenblock an einer Hilfslinie: Rufzeichen, Höhe als Flugfläche (`FL120` ab 5000 ft) oder in Hundertfuß (`038`), Pfeil für Steigen/Sinken, Ground Speed in kt, Muster. Die Blöcke weichen einander aus. Besondere Flugzeuge (siehe unten) bekommen eine dezente Eckenklammer in Magenta (Notfall rot, blinkend), keinen Schein. Flugzeuge am Boden bleiben kleine Quadrate. Das gewählte Flugzeug ist cyan mit Rahmen, Peil- und Entfernungslinie und einer Marke auf der Kompassrose. Die Karte zeigt Pisten mit Bezeichnern (05/23), Schwellenstrichen und Anfluglinien (die Piste in Betrieb in Grün), den Flughafen als Kreis mit Pistenkreuz und ICAO-Code, Entfernungsringe und außen eine Kompassrose (Strich alle 5°, Beschriftung alle 30°, N/E/S/W, Nordpfeil).

**Kopfzeile:** Ortsname (optional mit zweiter Zeile `title`), Lokalzeit (LT), UTC mit Z, Zahl der Flugzeuge, kompakter METAR (`EDDH 120820Z 23012G22KT 9999 … Q1013`), QNH und die Piste in Betrieb (`RWY 23`).

**Tafel:** Die untere Tafel zeigt FLUG, ROUTE, TYP, ALT (ab 5000 ft als Flugfläche mit `STD`), GS, DIST. Die Anzeigetafel (Überflüge) nutzt Zebrazeilen, Kopfband und die Flip-Animation. `node tools/contrast.mjs` prüft alle Stile in Dunkel und Hell mit allen Akzentfarben (WCAG, Text mindestens 4,5:1), eigene Hex-Akzente werden automatisch bis dahin angepasst. `node tools/tests/options.cjs .` testet die URL-Optionen.

Die Einrichtungsseite hat dafür die Abschnitte Theme, Anzeige, Einheiten und Elemente mit Live-Vorschau (`setup.html?demo=1` zeigt in der Vorschau den Demo-Verkehr). Die Einstellungen stehen in der Adresse und werden von `js/pwa.js` wie alle Parameter für die Home-Bildschirm-App gemerkt.

Für die Lesbarkeit aus drei Metern Abstand sind Schriften größer (nichts Wichtiges unter etwa 1,6 vh) und alle Texte haben mindestens 4,5:1 Kontrast.

## Wetterradar

Mit `wx=radar` zeichnet die App den Niederschlag über die Karte, in den Farben eines Cockpit-Wetterradars: **grün** leicht, **gelb** mäßig, **orange** stark, **rot** sehr stark. Die Flugzeuge, Datenblöcke und Anflugachsen liegen darüber, der Regen ist durchscheinend gezeichnet. Standard ist aus; im Einrichtungs-Assistenten gibt es den Schalter unter **Elemente** („Wetterradar“). Die Legende unten links nennt die Stufen, die Quelle und das Alter der Daten, dazu Reichweite und Sektor (`RNG 25 km · 360°`).

- **Stufen** (dBZ, Radarreflektivität): leicht 20 bis 34, mäßig 35 bis 44, stark 45 bis 54, sehr stark ab 55. Darunter wird nichts gezeichnet. Die Farben kommen aus den Stil-Rollen in `js/styles.js` (`ok`, `moderate`, `caution`, `warning`), in Hell und Dunkel passend.
- **Daten:** Deutscher Wetterdienst (DWD), Radarkomposit WN, beobachteter Niederschlag im 5-Minuten-Takt, Raster etwa 2 km, nur Deutschland und das Radar-Umfeld. Lizenz: Datenlizenz Deutschland – Namensnennung – Version 2.0 (siehe [THIRD_PARTY.md](THIRD_PARTY.md)). Der Hinweis „Daten: DWD“ steht in der Legende.
- **Wer sieht was:** Die App fragt `/api/radar` am eigenen Proxy ab (`api/radar.js`). Dieser holt die feste Datei von opendata.dwd.de, rechnet sie in ein Raster um und gibt es für alle gleich aus (Cache 2 Minuten, bei Fehlern bis 15 Minuten). Die Anfrage enthält **keine Position**, dein Standort verlässt den Browser nicht. Der DWD sieht nur den Server, nicht dich.
- **Frische:** Die Legende zeigt die Beobachtungszeit in UTC und das Alter („vor 4 min“). Ist die Beobachtung älter als 15 Minuten, verschwindet der Regen und die Legende sagt „Radar veraltet“.
- **Keine Vorhersage und keine Warnung:** Gezeigt wird nur, was der Radar gerade misst. Das ist kein Ersatz für Wetterwarnungen oder den Flugwetterbericht.
- **Demo:** `?demo=1&wx=radar` zeigt drei synthetische Regenzellen mit der Kennzeichnung „DEMO“ in der Legende. Im Live-Betrieb gibt es keine simulierten Daten.
- **Speicher:** Die Radardaten werden nicht im Browser gespeichert.

## Anzeigetafel

Im Wechsel (`view=auto`, Standard `views=radar,board`) blendet die App nach `radarsec` Sekunden eine zweite Ansicht im Stil einer Abflugtafel ein, nach `boardsec` Sekunden wieder den Radar. Mit `views=radar,board,airport` kommt dazwischen die Flughafen-Ansicht (`airportsec`); die Reihenfolge ist frei wählbar. Die Tafel zeigt: die zehn letzten Flugzeuge, die durch den Radius (`r`) geflogen sind, mit Uhrzeit der größten Annäherung, Route, Höhe, kleinster Entfernung und Landung/Start/Überflug, darunter die Tagesstatistik (Überflüge, häufigste Airline und häufigstes Muster, tiefster und nächster Überflug, größtes Flugzeug). Das Protokoll liegt nur im Browser (`localStorage`, je Kalendertag, die letzten zwei Tage) und verlässt das Gerät nicht.

## Bewegung

Die Animationen sind optional und sparsam, und jede Schleife ist auf der Showcase-Seite [`motion.html`](motion.html) mit Dauer und Kosten zu sehen (die Seite ist vom Fernseher aus nicht verlinkt). Die Stufe steuert der URL-Parameter `motion`:

| Wert | Wirkung |
|------|---------|
| `motion=calm` | Standard. Radar-Sweep (eine Umdrehung je 6 s, sehr schwach), Ring bei Neuankunft im Radius (einmal, 1,6 s, das Symbol blendet ein), Piste in Betrieb atmet (4 s), neue Spuren wachsen in 1 s, Notfall-Rahmen pulsiert langsam (3 s), Split-Flap, neueste Zeile der Anzeigetafel wird einmal markiert. |
| `motion=full` | Dasselbe, etwas deutlicher: Sweep mit kurzem Nachlauf, zweiter Ring, Notfall-Puls 2 s. |
| `motion=off` | Nichts bewegt sich: Werte springen, Rahmen stehen, keine Markierung. |

Ohne Parameter gilt `calm`, bei der Systemeinstellung „Bewegung reduzieren“ (`prefers-reduced-motion`) `off`. Ein ausdrücklicher Wert in der Adresse hat immer Vorrang. Ungültige Werte werden stillschweigend auf den Standard gesetzt. Die Stufe liegt in `js/config.js`, die Effekte in `js/motion.js` (reine Zeitkurven, getestet in `tools/tests/motion-test.cjs`), der Split-Flap in `js/board.js` und die Markierung der Anzeigetafel in `css/motion.css`.

Die Kosten sind klein: alle Effekte zusammen sind einige Linien und Kreise je Bild, ohne Schatten, ohne Filter und ohne Speicher je Bild. Der Split-Flap läuft im Takt der Bildschleife (keine eigenen Intervalle), im verborgenen Tab läuft nichts. Gemessen mit `node tools/tests/motion-perf.cjs` (Demo, 1920×1080, Headless-Chromium): die Bildarbeit liegt mit `motion=off` bei rund 2,3 ms, mit `motion=full` ebenso (Unterschied im Mittel unter 0,1 ms; auf einem Fernseher mit schwacher Grafik ist das nicht gemessen).

Einbrennschutz: Bewegte Teile sind auf OLED-Fernsehern ein Risiko. Deshalb gibt es keinen Blinker mehr, der dauerhaft läuft (der bisherige Ein-Sekunden-Blinker des Notfall-Rahmens ist ein langsamer Puls), und die Uhr blinkt nicht. Nicht umgesetzt: einfahrende Überflugzeilen und ein blinkender Doppelpunkt (auf OLED kritisch) sowie ein Steig- und Sinkpfeil, der flackert.

## Einrichtungs-Assistent

`setup.html` ist ein geführter Ablauf mit fünf Schritten, gedacht für Menschen, die den Link nur bekommen haben:

1. **Willkommen**: was MyAirspace ist, mit einer Live-Vorschau (Demo-Verkehr).
2. **Standort**: „Meinen Standort verwenden“, Ortssuche, Flughäfen mit Karte oder Koordinaten. Der Ort wird angezeigt, bevor es weitergeht.
3. **Look**: Stil (Karte mit Mini-Vorschau), Hell/Dunkel/Automatisch, Akzentfarbe.
4. **Inhalt**: Ansicht (Radar, Tafel, Flughafen oder ein Wechsel aus Radar und Tafel, auch mit Flughafen; die Zeiten je Ansicht; für Flughafen die Wahl des Flughafens), welche Elemente zu sehen sind, Einheiten, Radius, Nachtdimmen.
5. **Fernseher**: Adresse, QR-Code, „Testen“, dazu Schritte für Smart-TV, Apple TV (AirPlay), Computer und Handy oder iPad, „Link teilen“, wenn der Browser es kann.

Am Ende stehen drei Tipps (Nachtdimmen, `style=` ändern, später wieder hier öffnen). Zurück behält alle Eingaben. Der Fortschritt steht nur in `sessionStorage` (dieser Tab, nach dem Schließen weg) und nichts davon geht an einen Server. Wer alles auf einmal sehen will, nutzt **Alle Einstellungen** (`setup.html?wizard=0` oder `#alle`), die Schritte springen direkt an: `#standort`, `#look`, `#inhalt`, `#fernseher`, `#fertig`. `?wizard=1` beginnt von vorn. Alle Texte stehen zentral im Objekt `MA.COPY` in `js/onboarding.js`.

## Auf dem Fernseher

- **Smart-TV (Samsung, LG, Android TV, Fire TV):** Die URL im eingebauten Browser öffnen und als Lesezeichen speichern. Mit Vollbild bzw. ausgeblendeter Adressleiste sieht es am besten aus.
- **Apple TV:** tvOS hat keinen Webbrowser. Öffne die URL in Safari auf dem Mac, iPad oder iPhone, schalte Safari auf Vollbild und spiegle den Bildschirm per AirPlay auf den Apple TV. Auf dem iPhone/iPad kannst du die Seite auch über *Teilen → Zum Home-Bildschirm* als Vollbild-App speichern.
- Wo der Browser es kann (Wake Lock API), verhindert die Seite, dass der Bildschirm ausgeht. Gegen Einbrennen auf OLED-Fernsehern verschiebt sich das ganze Bild alle zwei Minuten um ein paar Pixel.

## Flugzeuge am Boden

Flugzeuge am Boden werden an den Flughäfen der Karte (bis 4 km um den Flughafen) als kleine Quadrate mit Kursstrich angezeigt (`ground=0` blendet sie aus), die Kopfzeile nennt die Zahl („3 am Boden“). Sie erscheinen nie auf der Tafel.

## Vollbild am Computer

Wenn du das Dashboard am Computer im Browser offen hast, sitzt der Knopf „Vollbild“ unten rechts. Beim Laden ist er zwölf Sekunden deutlich zu sehen, danach bleibt er dezent sichtbar und wird beim Überfahren hell. Alternativ schaltet die Taste **F** oder ein Doppelklick um, **Esc** beendet das Vollbild. Den Knopf gibt es nur, wo der Browser Vollbild unterstützt, und nicht in installierten Apps.

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
- `?proxy=` wird nur akzeptiert, wenn der Wert `DEFAULT_PROXY` ist, `off` (kein Proxy: die App fragt dann keine Flugdaten ab, sondern zeigt den Status) oder eine `https://…vercel.app/api/proxy`-Adresse auf dem Host des eigenen Projekts. Alles andere wird ignoriert.
- **Routen** (`MUC → HAM`) fragt die App direkt bei adsb.lol ab, dieser Endpunkt erlaubt Browser-Abfragen. Flugdaten und Wetter gehen nur über den eigenen Proxy, ohne direkten Rückfall an Dritte.
- **Opt-in `?public=1`:** zusätzlich werden die öffentlichen CORS-Proxys `allorigins.win` und `codetabs.com` sowie die Quellen airplanes.live und OpenSky benutzt. Datenschutzhinweis: Diese Dritten sehen dann jede Abfrage samt (auf etwa 1 km gerundetem) Standort und deiner IP-Adresse. Die App zeigt es in der Fußzeile an („öffentliche Proxys“) und merkt sich die gewählte Route nicht dauerhaft.
- Ein Cloudflare Worker eignet sich **nicht** als Proxy: adsb.lol drosselt Anfragen aus Cloudflare Workers (429), airplanes.live verlangt eine Registrierung (403), OpenSky ist nicht erreichbar (522). Stand Oktober 2026.

**Sicherheit des Proxys:** Er erlaubt nur `https` ohne Port und ohne Zugangsdaten in der Adresse, nur diese Host-/Pfad-Paare, alles andere ergibt 403:

| Host | Pfad |
|------|------|
| `api.adsb.lol` | `/v2/point/…`, `/api/0/route/…` |
| `api.airplanes.live` | `/v2/point/…` |
| `opensky-network.org` | `/api/states/all` |
| `aviationweather.gov` | `/api/data/metar` |

Das Wetterradar (`wx=radar`) hat eine eigene Funktion, [`api/radar.js`](api/radar.js): sie nimmt **keine** Adresse aus der Anfrage entgegen, holt nur die feste DWD-Datei und gibt ein Raster aus. Sie ist deshalb keine Weiterleitung und steht nicht in der Tabelle oben. Weitere Schutzmaßnahmen: nur die Herkunft `kdniem.github.io`, `myairspace-nu.vercel.app` und `localhost`/`127.0.0.1` (Entwicklung); Weiterleitungen des Ziels werden nicht verfolgt; Antworten müssen gültiges JSON sein und werden immer als `application/json` mit `nosniff` und strenger CSP ausgeliefert (Fehler nie als HTML); Fehlerantworten enthalten keinen Inhalt des Ziels; Koordinaten in `/v2/point/` werden serverseitig auf 2 Nachkommastellen gerundet und der Radius auf 250 nm begrenzt. Die App schickt den Standort ohnehin nur auf etwa 1 km gerundet ab. Rechtliches: [LICENSE](LICENSE), [THIRD_PARTY.md](THIRD_PARTY.md), [datenschutz.html](datenschutz.html).

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

### Flughafen-Ansicht

`view=airport&airport=FRA` zeigt einen Flughafen als Fokus; `views=radar,board,airport&airport=FRA` wechselt im Rhythmus dorthin (1,2 s Überblendung, der Radar läuft im Hintergrund weiter). So sieht die Ansicht aus: das Vorfeld ist in die Mitte gezoomt (Vorfeld, Rollwege, Terminals, Hangars, Gates und Positionen mit Bezeichnung, wo sie kartiert sind), die Pisten mit Bezeichnern, die letzten 10 km der verlängerten Pistenachsen als kurze Anflug- und Abflugschneisen (die Piste in Betrieb in Grün). Flugzeuge im Umkreis von 12 km: in der Luft mit Flugzeugsymbol und Datenblock, wenn sie anfliegen oder abfliegen; am Boden an ihrer echten Position auf dem Vorfeld, nur das gewählte mit Rufzeichen. Oben stehen Flughafen, Ortszeit und UTC, „x im Anflug · y am Boden“, unten METAR und Piste in Betrieb. Die Anzeigetafel entfällt; wie bei jeder Ansicht folgen Stil und Theme. Der Standort wird dafür nicht gebraucht, die Daten kommen vom Flughafen aus. Ohne Standort und ohne `demo=1` läuft die Ansicht mit Live-Daten.

Der Maßstab passt das Vorfeld (Box aus Vorfeld, Terminals und Gates, plus 0,6 km Rand) in den Bildschirm, nicht die ganze Pistenlänge: bei HAM sind das gut acht Kilometer, dann blieben Gates und Positionen unlesbar. Piste-Enden außerhalb des Bildes sieht man nicht, ihre Schneisen laufen aber vom Rand her hinein. Die Vorfeld-Daten stammen von OpenStreetMap (Abschnitt unten). Der Rest des Radars bleibt unverändert.

### Flughafen-Detaildaten

`data/airport-detail.js` (ODbL, bleibt unter ODbL und ist nicht vom MIT-Lizenztext der App abgedeckt) enthält für HAM, XFW, FRA, FMO und CPH Vorfelder, Rollwege, Terminals, Hangars, Gates, Abstellpositionen, Hubschrauberlandeplätze und Pisten für eine vergrößerte Flughafenansicht (`MA.airportDetail`, Koordinaten als `[lat, lon]` mit 5 Nachkommastellen, auf etwa 2 m vereinfacht). Quelle ist OpenStreetMap, Daten © OpenStreetMap-Mitwirkende, [ODbL](https://www.openstreetmap.org/copyright). Neu erzeugen mit `python3 -I tools/build-airport-detail.py [cache_dir]`; das Skript lädt die Rohdaten kachelweise von der OSM-API (mit Pausen und User-Agent) und legt sie in `cache_dir` ab, weitere Läufe arbeiten offline. Größe: siehe Commit-Nachricht bzw. `ls -l data/airport-detail.js` (Ziel höchstens 120 KB je Flughafen). Wie vollständig ein Flughafen ist, hängt von den Mappern ab; nicht jeder hat Gates oder Rollwegnamen. Nicht zur Navigation geeignet.
### Luftfahrtkarte als Hintergrund (`chartbg=1`)

Optional, Standard aus. Mit `chartbg=1` (oder dem Schalter „Luftfahrtkarte“ auf der Einrichtungsseite) zeichnet der Radar im Hintergrund eine Karte im Stil einer Luftfahrtkarte aus Papier: ein feines Gradnetz mit Grad- und Minutenbeschriftung am Rand, Lufträume als Umrisse in Klassenfarben (Kontrollzonen und Terminal-Bereiche blau, Sperr- und Gefahrengebiete rot, Gefahrengebiete magenta, Fallschirmsprung und Übriges gedämpft), Funkfeuer (VOR als Sechseck, NDB als Kreis, DME als Quadrat, mit Kennung und Frequenz), Hindernisse ab 150 m Höhe als kleine Dreiecke und eine Marke für die magnetische Nordrichtung (`MAG`, aus der Missweisung des nächsten Flughafens). Im Stil `chart` ist der Hintergrund hell wie Papier, in den anderen Stilen gedämpft. Flugzeuge, Wetter und Anzeigetafel liegen weiterhin darüber.

**Daten:** Lufträume und Hindernisse aus den offenen [OpenAIP](https://www.openaip.net)-Datenbeständen (Lizenz CC BY-NC 4.0, Namensnennung wird in der Fußzeile gezeigt). Funkfeuer und Flughäfen aus [OurAirports](https://ourairports.com) (gemeinfrei). Die Daten sind in `data/chart-features.js` festgeschrieben: Die App ruft dafür nichts ab. Abgedeckt ist ein Umkreis von etwa 75 km um HAM, FRA, FMO und CPH mit den Nachbarländern DE, DK, NL und SE, außerhalb davon bleibt der Hintergrund leer. Die Datei entsteht mit `python3 tools/build-chart.py` (Quellen werden zuerst in `tools/.cache/` geladen; sie bleibt unter 150 KB). Die Karte zeigt das Gradnetz und die Lufträume vereinfacht und ist **nicht zur Navigation** geeignet: maßgeblich sind die amtlichen Unterlagen. Es wird keine offizielle Luftfahrtkarte nachgebildet oder kopiert.

Test: `tools/tests/chart-test.cjs` prüft die Datei und die Zeichenfunktionen (mit `chartbg=0` wird nichts gezeichnet).

### Routen

Die Route (z. B. `NCE → HAM`) kommt aus der Routendatenbank von adsb.lol. Bei Umläufen wie `HAM-NCE-HAM` zeigt die App nur den Abschnitt, den das Flugzeug gerade fliegt: Ausschlaggebend sind Position, Kurs und Steig- oder Sinkflug. „Anflug“ bzw. „Abflug“ erscheint bei Flughäfen bis 60 km vom Standort. Für Privatflieger, Hubschrauber und manche Charterflüge kennt die Datenbank keine Route.

### Airline-Abzeichen statt Logos

Echte Airline-Logos sind absichtlich **nicht** enthalten: Sie sind Marken mit eigenen Nutzungsbedingungen, und die App lädt auch keine Bilder von Dritten nach. Stattdessen gibt es selbst gebaute Abzeichen (`js/airlines.js`): eine flache Kachel in einer an die Lackierung angelehnten Farbe mit dem IATA-Code (`LH`, `EK`, `FR`), wo kein IATA-Code bekannt ist mit dem ICAO-Kürzel (`CHX`, `AIB`). Die Schriftfarbe (schwarz oder weiß) wird automatisch so gewählt, dass mindestens 4,5 : 1 Kontrast erreicht wird. Die Ecken folgen dem Stil (eckig bei Terminal/Airbus/Karte/Militär, leicht gerundet bei ATC/Nacht, rund bei Boeing); der Stil `night` zeigt nur eine Umrisskachel ohne Farbe (blendfrei). Der Betreiber ergibt sich aus den ersten drei Buchstaben des Rufzeichens (`DLH8NA` → `DLH`). Unbekannter Betreiber: neutrale graue Kachel mit dem ICAO-Kürzel; Privat- und Sportflug (Rufzeichen wie ein Kennzeichen): Kachel mit dem Flugzeugtyp. Zu sehen sind die Abzeichen links vom Rufzeichen auf der Tafel, auf dem Radar und in der Flughafen-Ansicht direkt neben dem Flugzeugsymbol (nur bekannte Betreiber; auf der Seite gegenüber dem Datenblock, Höhe skaliert mit dem Bildschirm, bei `logos=0` aus) und in der Spalte AIRLINE der Überflugliste. Mit `logos=0` (oder in der Einrichtung unter Elemente) verschwinden sie.

**Neue Airline ergänzen:** in `js/airlines.js` in der Tabelle `T` eine Zeile hinzufügen, Schlüssel ist der ICAO-Code des Betreibers:

```
XYZ: ['XY', 'Beispiel Air', '#1d3c78'],   // ICAO: [IATA oder '', Anzeigename, Lackierungsfarbe]
```

`node tools/contrast.mjs` prüft alle Einträge (Farbformat, Kontrast der Schrift). Bitte nur Farbe und Buchstaben verwenden, keine nachgezeichneten Logos.

### Tafel-Auswahl

Welches Flugzeug unten auf der Tafel steht, entscheidet `js/pick.js` ruhig und nachvollziehbar: mindestens 12 s Anzeigedauer vor jedem Wechsel (Ausnahme: ein neuer Notfall-Squawk 7700/7600/7500 springt sofort), danach Wechsel nach `rotate` Sekunden zum am längsten nicht gezeigten der vier nächsten Flugzeuge (stabile Reihenfolge nach Hex-Code, kein Hin und Her A-B-A innerhalb von 30 s). Das angezeigte Flugzeug bleibt, solange es im Radius und unter den sechs nächsten ist; ein sehr naher Neuankömmling (unter 2 km) löst es nur ab, wenn es weiter als 6 km entfernt ist oder sich entfernt. Besondere Flugzeuge springen höchstens einmal je zwei Rotationsschritte vor. Getestet mit `tools/tests/pick-test.cjs`.

## Diagnoseprotokoll

Für Verbindungsabbrüche gibt es ein Protokoll, das nur im Browser des Geräts liegt (`js/diag.js`, Schlüssel `ma.diag` im `localStorage`):

- **Was drinsteht:** fehlgeschlagene Abfragen je Quelle mit HTTP-Code und Dauer (`data`), Wechsel zwischen frisch, veraltet und offline mit dem Alter der Daten (`status`), Netz- und Tab-Wechsel (`net`), Bildhänger über 2 s (`stall`), Skriptfehler mit Datei und Zeile, ohne Stack (`error`), Service-Worker-Registrierung (`sw`), Start mit Version und Stil (`boot`) und Wake Lock (`wake`). Erfolgreiche Abfragen stehen nur am Ende einer Störung (mit der Lücke) und beim ersten Start, sonst wären die 500 Einträge nach gut einer halben Stunde voll.
- **Begrenzt:** höchstens 500 Einträge, Einträge älter als 72 Stunden werden entfernt, Schreibzugriffe höchstens einmal pro Sekunde.
- **Ausgeschlossen:** Standort, Koordinaten, Rufzeichen, IP-Adresse und Flugdaten. Texte werden vor dem Speichern bereinigt (URLs, Koordinaten, Rufzeichen-ähnliche Codes und Werte wie `lat=`, `lon=`, `label=`, `title=` entfallen). `tools/tests/diag-test.cjs` prüft das.
- **Ansehen:** `?diag=1` an die Radar-Adresse hängen zeigt ein kleines Feld mit der Zusammenfassung der letzten 24 Stunden und den letzten 30 Einträgen (nur auf dem Bildschirm, nichts wird geschickt).
- **Herunterladen oder leeren:** auf der Einrichtungsseite unter „Erweitert: Diagnoseprotokoll“ (`setup.html?diag=export` öffnet den Abschnitt). Der Download ist eine Textdatei, die der Browser nur auf Klick erzeugt; „Protokoll leeren“ löscht den Inhalt.
- **Nichts wird übertragen:** das Protokoll verlässt das Gerät nicht, es gibt keinen Server dafür und keine zusätzlichen Drittanbieter-Anfragen.

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
setup.html             Einrichtungsseite als geführter Assistent (css/setup.css, js/onboarding.js, js/setup.js, js/qr.js)
manifest.webmanifest   Web-App-Manifest, Icons in icons/ (tools/build-icons.mjs)
sw.js                  Service Worker: App-Dateien offline, network-first
css/style.css          Textrollen (Label, Wert, Einheit), Layout, TV-Sicherheitsrand; Farben kommen als CSS-Variablen aus js/styles.js
tools/contrast.mjs     Kontrastprüfung (WCAG) für alle Stile, Themes und Akzentfarben
tools/tests/           run-all.mjs (alles), browser.mjs, compat.mjs, options.cjs, poll-test.cjs (Abfragetakt), pick-test.cjs (Tafel-Auswahl), diag-test.cjs (Diagnoseprotokoll), proxy-test.mjs, motion-sim.js, motion-test.cjs (Bewegung), motion-perf.cjs (Bildkosten, nicht in run-all)
data/geo-features.js   Pisten, Gewässer, Orte (erzeugt von tools/build-geo.py)
data/airport-detail.js Vorfeld, Rollwege, Terminals, Gates der fünf Flughäfen (erzeugt von tools/build-airport-detail.py, OpenStreetMap)
tools/build-geo.py     Generator für die Kartendaten
api/proxy.js           CORS-Proxy als Vercel Function (Host-/Pfad-Allowlist)
js/pwa.js              Home-Bildschirm-App: letzte Einstellungen wiederherstellen; DEFAULT_PROXY
js/diag.js             Diagnoseprotokoll (lokal im Browser, siehe oben): Ringpuffer, Zusammenfassung, Panel ?diag=1, Download auf der Einrichtungsseite
js/styles.js           STYLES-Tabelle: Rollenfarben je Stil und Theme, Symbole, Schrift (Daten, keine Logik pro Stil)
js/config.js           URL-Parameter
js/theme.js            Dunkel/Hell/Automatisch (Sonnenstand), setzt data-theme und die Stil-Variablen vor dem ersten Bild
js/hint.js             Willkommensbild auf der TV-Seite, wenn kein Standort in der URL steht
js/data.js             Datenquellen, Fallback, Routen-Cache
js/demo.js             Simulierter Verkehr für ?demo=1
js/airlines.js         Tabelle MA.airlines und Abzeichen (Kacheln) für Tafel und Karte
js/glyphs.js           Flugzeug-Silhouetten nach ICAO-Typ (Canvas-Pfade)
js/pick.js             Auswahl des Flugzeugs auf der Tafel (reine Logik, getestet)
js/radar.js            Canvas-Karte: Kompassrose, Pisten, Flugzeuge, Flugspuren, Datenblöcke
js/airport.js          Flughafen-Ansicht (view=airport): Anpassung der Box, statische Vorfeldschicht, Korridore, Flugzeuge am Boden und in der Luft
js/motion.js           Bewegung (motion=off|calm|full): Zeitkurven und Zeichenhilfen für Radar, Tafel und Showcase
motion.html            Showcase der Bewegungen mit Dauer und Kosten (nicht vom Fernseher aus verlinkt)
js/board.js            Tafel mit Split-Flap-Effekt
js/main.js             Abfrage-Schleife, Glättung, Rotation, Dimmen, Wake Lock
```

Alles ist reines JavaScript ohne Framework und läuft auch in älteren TV-Browsern.
