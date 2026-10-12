# Drittanbieter und Lizenzen

MyAirspace selbst steht unter der MIT-Lizenz (siehe [LICENSE](LICENSE)). Die folgenden Daten, Dienste und Bestandteile stammen von Dritten.

## Datenquellen (zur Laufzeit abgefragt)

| Quelle | Verwendung | Lizenz / Bedingungen |
|--------|------------|----------------------|
| [adsb.lol](https://adsb.lol) | Flugzeugpositionen und Routen (Standardquelle) | Open Database License (ODbL) 1.0. Namensnennung: „Daten: adsb.lol“ (wird in der App angezeigt). |
| [airplanes.live](https://airplanes.live) | Flugzeugpositionen, nur mit `?public=1` | Nutzungsbedingungen von airplanes.live (nicht kommerzielle Nutzung, Namensnennung). |
| [The OpenSky Network](https://opensky-network.org) | Flugzeugpositionen, nur mit `?public=1` | Nutzungsbedingungen des OpenSky Network (Forschung und nicht kommerzielle Nutzung, Namensnennung). |
| [aviationweather.gov](https://aviationweather.gov) (NOAA / National Weather Service) | METAR-Wetterberichte | Daten der US-Behörde, frei nutzbar. |
| [OpenStreetMap / Nominatim](https://nominatim.openstreetmap.org) | Ortssuche und Ortsname auf der Einrichtungsseite (`setup.html`) | Daten © OpenStreetMap-Mitwirkende, ODbL 1.0; es gilt die [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/). |

## In das Repository eingebundene Daten

| Daten | Verwendung | Lizenz |
|-------|------------|--------|
| [OurAirports](https://ourairports.com) | Pisten und Flughäfen (`data/geo-features.js`) | Gemeinfrei (Public Domain) |
| [Natural Earth](https://www.naturalearthdata.com) | Flüsse und Küsten (`data/geo-features.js`) | Gemeinfrei (Public Domain) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Vorfelder, Rollwege, Terminals, Gates u. a. der Flughäfen (`data/airport-detail.js`) | Daten © OpenStreetMap-Mitwirkende, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |

## Code

### QR Code generator library (Project Nayuki)

`js/qr.js` ist eine angepasste, verkürzte Fassung der „QR Code generator library“ von Project Nayuki (<https://www.nayuki.io/page/qr-code-generator-library>), Lizenz MIT. Originaler Lizenztext:

```
Copyright (c) Project Nayuki. (MIT License)
https://www.nayuki.io/page/qr-code-generator-library

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:
- The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.
- The Software is provided "as is", without warranty of any kind, express or
  implied, including but not limited to the warranties of merchantability,
  fitness for a particular purpose and noninfringement. In no event shall the
  authors or copyright holders be liable for any claim, damages or other
  liability, whether in an action of contract, tort or otherwise, arising from,
  out of or in connection with the Software or the use or other dealings in the
  Software.
```

## Schriften

- **IBM Plex Mono** (© IBM Corp.) steht unter der SIL Open Font License 1.1 (<https://openfontlicense.org>). Die Schriften werden vom eigenen Server ausgeliefert; die jeweiligen Copyright-Hinweise und die OFL-Lizenztexte gehören zu den Schriftdateien und müssen bei der Weitergabe mitgeliefert werden.
