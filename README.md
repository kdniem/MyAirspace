# MyAirspace

Ein ruhiges, dunkles Live-Flugradar für den Fernseher. Dein Standort ist in der Mitte, um dich herum siehst du die Flugzeuge mit ihren Spuren, die Pisten von Hamburg (HAM) und Finkenwerder (XFW) samt verlängerten Anfluglinien und unten eine LED-Tafel mit dem Flugzeug, das dir gerade am nächsten ist.

Die App ist nur zum Anschauen gedacht: URL öffnen, fertig. Es gibt keine Bedienung, keinen API-Key und keinen Build-Schritt.

## Einrichten

Am einfachsten auf dem Handy: **[setup.html](https://kdniem.github.io/MyAirspace/setup.html)** öffnen. Dort wählst du deinen Standort (per GPS, Ortssuche oder einen der Flughäfen mit Karte), stellst Radius, Einheiten, Spuren und Nachtdimmen ein und siehst sofort eine Vorschau. Am Ende bekommst du die fertige Adresse für den Fernseher zum Kopieren, Öffnen oder als QR-Code. Der Standort wird standardmäßig auf etwa 1 km gerundet. Die Seite speichert nichts; die Ortssuche nutzt Nominatim von OpenStreetMap.

Öffnest du die TV-Seite ohne Standort, zeigt sie unten links für 20 Sekunden einen kleinen Hinweis auf die Einrichtungsseite.

**Als App:** Die Seite hat ein Web-App-Manifest. Auf iPad/iPhone in Safari *Teilen → Zum Home-Bildschirm*, auf Android *Zum Startbildschirm hinzufügen*. Die App startet im Vollbild mit deinen zuletzt geöffneten Einstellungen. Ein kleiner Service Worker (`sw.js`) hält nur die App-Dateien offline vor, nie Flugdaten.

## Aufrufen

```
https://<dein-github-name>.github.io/MyAirspace/?lat=53.66&lon=10.05&r=20&label=Langenhorn
```

Deine Koordinaten stehen nur in der URL, nicht im Code. Setz sie einmal als Lesezeichen bzw. Startseite im TV-Browser.

| Parameter  | Standard        | Bedeutung |
|------------|-----------------|-----------|
| `lat`, `lon` | Hamburg-Zentrum | Dein Standort (Dezimalgrad, z. B. aus Google Maps per Rechtsklick) |
| `r`        | `25`            | Radius des Hauptrings in km |
| `label`    | `Hamburg`       | Ortsname oben links |
| `units`    | `ft`            | Höhenangaben in `ft` oder `m` |
| `poll`     | `5`             | Abfrageintervall in Sekunden |
| `rotate`   | `9`             | Sekunden pro Flugzeug auf der LED-Tafel (sie wechselt durch die vier nächsten) |
| `trail`    | `4`             | Länge der Flugspuren in Minuten |
| `night`    | `23-6`          | Zeitraum, in dem gedimmt wird (`off` schaltet das Dimmen aus) |
| `dim`      | `0.45`          | Helligkeit während der Nachtzeit |
| `labels`   | `1`             | Beschriftungen an den Flugzeugen (`0` = aus) |
| `places`   | `1`             | Ortsnamen auf der Karte (`0` = aus) |
| `proxy`    | –               | Eigener CORS-Proxy, siehe [Proxy](#proxy-cors) |
| `provider` | `auto`          | Datenquelle festlegen: `adsblol`, `airplaneslive`, `opensky` |
| `demo`     | `0`             | `1` zeigt simulierten Hamburger Verkehr (zum Ausprobieren ohne Netz) |

## Auf dem Fernseher

- **Smart-TV (Samsung, LG, Android TV, Fire TV):** Die URL im eingebauten Browser öffnen und als Lesezeichen speichern. Mit Vollbild bzw. ausgeblendeter Adressleiste sieht es am besten aus.
- **Apple TV:** tvOS hat keinen Webbrowser. Öffne die URL in Safari auf dem Mac, iPad oder iPhone, schalte Safari auf Vollbild und spiegle den Bildschirm per AirPlay auf den Apple TV. Auf dem iPhone/iPad kannst du die Seite auch über *Teilen → Zum Home-Bildschirm* als Vollbild-App speichern.
- Wo der Browser es kann (Wake Lock API), verhindert die Seite, dass der Bildschirm ausgeht. Gegen Einbrennen auf OLED-Fernsehern verschiebt sich das ganze Bild alle zwei Minuten um ein paar Pixel.

## Daten

- **adsb.lol** (Standard): offene ADS-B-Daten unter ODbL, ohne Key. Von hier kommen auch die Routen (z. B. `MUC → HAM`).
- **airplanes.live**: Ersatz, wenn adsb.lol nicht antwortet.
- **OpenSky Network**: letzte Rückfallebene. Anonym gibt es nur wenige Abfragen pro Tag, deshalb wird hier höchstens alle 30 s abgefragt.

Fällt eine Quelle aus, nimmt die App automatisch die nächste und versucht es nach fünf Minuten wieder mit der ersten. Zwischen zwei Abfragen werden die Positionen anhand von Kurs und Geschwindigkeit weitergerechnet, deshalb bewegen sich die Flugzeuge flüssig.

### Proxy (CORS)

Keine der drei Quellen erlaubt Abfragen direkt aus dem Browser (CORS). Die App leitet die Abfragen deshalb um:

- **Standard: eigener Proxy auf Vercel** unter `https://myairspace-nu.vercel.app/api/proxy` ([`api/proxy.js`](api/proxy.js), in `js/config.js` als `DEFAULT_PROXY`). Er reicht nur die drei Flugdaten-APIs weiter, nur für `kdniem.github.io`, `*.vercel.app` und `localhost`, mit 3 s CDN-Cache. adsb.lol funktioniert darüber; airplanes.live (403) und OpenSky (Timeout) nicht, für sie greift der Rückfall. Vercel deployt jeden Push auf `main` automatisch. Einrichtung bei einem neuen Konto:
  1. Auf [vercel.com](https://vercel.com) mit **Continue with GitHub** anmelden.
  2. **Add New → Project**, das Repo `kdniem/MyAirspace` importieren, Framework **Other**, nichts weiter einstellen, **Deploy**.
  3. Die Adresse `https://<projekt>.vercel.app/api/proxy` in `js/config.js` als `DEFAULT_PROXY` eintragen (oder per `?proxy=…` in der URL).
- **Rückfall:** die öffentlichen CORS-Proxies `allorigins.win` und `codetabs.com`. Mit `?proxy=off` nutzt die App nur diese. Den Standort schickt die App nur auf etwa 1 km gerundet ab.
- **Routen** (`MUC → HAM`) kommen direkt von adsb.lol, dieser Endpunkt erlaubt Browser-Abfragen.
- Ein Cloudflare Worker eignet sich **nicht** als Proxy: adsb.lol drosselt Anfragen aus Cloudflare Workers (429), airplanes.live verlangt eine Registrierung (403), OpenSky ist nicht erreichbar (522). Stand Oktober 2026.

Farben: **Cyan** heißt sinkend (Anflug), **Bernstein** steigend (Abflug), **Weiß** Reiseflug. Überflüge oberhalb von FL200 sind abgedunkelt. Airbus-Sonderflüge (Beluga, Testflüge `AIB…`) bekommen auf der LED-Tafel ein eigenes Abzeichen.

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

## Aufbau

```
index.html             Layout (Karte, Kopfzeile, LED-Tafel)
setup.html             Einrichtungsseite (css/setup.css, js/setup.js, js/qr.js)
manifest.webmanifest   Web-App-Manifest, Icons in icons/ (tools/build-icons.mjs)
sw.js                  Service Worker: App-Dateien offline, network-first
css/style.css          Dark Theme, Dot-Matrix-Optik, TV-Sicherheitsrand
data/geo-features.js   Pisten, Gewässer, Orte (erzeugt von tools/build-geo.py)
tools/build-geo.py     Generator für die Kartendaten
api/proxy.js           CORS-Proxy als Vercel Function
js/pwa.js              Home-Bildschirm-App: letzte Einstellungen wiederherstellen
js/config.js           URL-Parameter
js/hint.js             Hinweis auf setup.html, wenn kein Standort in der URL steht
js/data.js             Datenquellen, Fallback, Routen-Cache
js/demo.js             Simulierter Verkehr für ?demo=1
js/radar.js            Canvas-Karte
js/board.js            LED-Tafel mit Split-Flap-Effekt
js/main.js             Abfrage-Schleife, Glättung, Rotation, Dimmen, Wake Lock
```

Alles ist reines JavaScript ohne Framework und läuft auch in älteren TV-Browsern.
