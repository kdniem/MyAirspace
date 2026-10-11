# MyAirspace

Ein ruhiges, dunkles Live-Flugradar für den Fernseher. Dein Standort ist in der Mitte, um dich herum siehst du die Flugzeuge mit ihren Spuren, die Pisten von Hamburg (HAM) und Finkenwerder (XFW) samt verlängerten Anfluglinien und unten eine LED-Tafel mit dem Flugzeug, das dir gerade am nächsten ist.

Die App ist nur zum Anschauen gedacht: URL öffnen, fertig. Es gibt keine Bedienung, keinen API-Key und keinen Build-Schritt.

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

Farben: **Cyan** heißt sinkend (Anflug), **Bernstein** steigend (Abflug), **Weiß** Reiseflug. Überflüge oberhalb von FL200 sind abgedunkelt. Airbus-Sonderflüge (Beluga, Testflüge `AIB…`) bekommen auf der LED-Tafel ein eigenes Abzeichen.

Die Karte ist absichtlich vereinfacht. Elbe, Orte und Pistenlage sind nur ungefähr eingezeichnet und taugen nicht zur Navigation.

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
css/style.css          Dark Theme, Dot-Matrix-Optik, TV-Sicherheitsrand
data/geo-features.js   Pisten HAM/XFW, Elbe, Alster, Orte
js/config.js           URL-Parameter
js/data.js             Datenquellen, Fallback, Routen-Cache
js/demo.js             Simulierter Verkehr für ?demo=1
js/radar.js            Canvas-Karte
js/board.js            LED-Tafel mit Split-Flap-Effekt
js/main.js             Abfrage-Schleife, Glättung, Rotation, Dimmen, Wake Lock
```

Alles ist reines JavaScript ohne Framework und läuft auch in älteren TV-Browsern.
