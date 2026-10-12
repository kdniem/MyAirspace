# Drittanbieter und Lizenzen

MyAirspace selbst steht unter der MIT-Lizenz (siehe [LICENSE](LICENSE)). Die folgenden Daten, Dienste und Bestandteile stammen von Dritten.

**Ausnahme:** `data/chart-features.js` (Lufträume von OpenAIP) steht unter CC BY-NC 4.0, nicht unter MIT. Kommerzielle Nutzung oder Weiterverbreitung mit dieser Datei ist nicht erlaubt. Für eine kommerzielle Fassung die Datei und die Option `chartbg` entfernen.

## Datenquellen (zur Laufzeit abgefragt)

| Quelle | Verwendung | Lizenz / Bedingungen |
|--------|------------|----------------------|
| [adsb.lol](https://adsb.lol) | Flugzeugpositionen und Routen (Standardquelle) | Open Database License (ODbL) 1.0. Namensnennung: „Daten: adsb.lol“ (wird in der App angezeigt). |
| [airplanes.live](https://airplanes.live) | Flugzeugpositionen, nur mit `?public=1` | Nutzungsbedingungen von airplanes.live (nicht kommerzielle Nutzung, Namensnennung). |
| [The OpenSky Network](https://opensky-network.org) | Flugzeugpositionen, nur mit `?public=1` | Nutzungsbedingungen des OpenSky Network (Forschung und nicht kommerzielle Nutzung, Namensnennung). |
| [aviationweather.gov](https://aviationweather.gov) (NOAA / National Weather Service) | METAR-Wetterberichte | Daten der US-Behörde, frei nutzbar. |
| [Deutscher Wetterdienst (DWD)](https://opendata.dwd.de), Radarkomposit WN | Wetterradar (`wx=radar`): beobachteter Niederschlag, vom Server des Projekts abgerufen (`api/radar.js`), nie vom Browser. Der Abruf enthält keine Standortdaten. | Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0), Quellenangabe „Deutscher Wetterdienst“ (in der App: „Daten: DWD“). Bitte die aktuellen Nutzungsbedingungen des DWD prüfen; die Lizenzangabe ist vom Betreiber zu bestätigen. |
| [OpenStreetMap / Nominatim](https://nominatim.openstreetmap.org) | Ortssuche und Ortsname auf der Einrichtungsseite (`setup.html`) | Daten © OpenStreetMap-Mitwirkende, ODbL 1.0; es gilt die [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/). |

## In das Repository eingebundene Daten

| Daten | Verwendung | Lizenz |
|-------|------------|--------|
| [OurAirports](https://ourairports.com) | Pisten und Flughäfen (`data/geo-features.js`), Funkfeuer (VOR, NDB, DME) und Missweisung der Flughäfen (`data/chart-features.js`) | Gemeinfrei (Public Domain) |
| [OpenAIP](https://www.openaip.net) | Lufträume (Kontrollzonen, Sperr- und Gefahrengebiete u. a.) und Hindernisse ab 150 m (Koordinaten auf vier Nachkommastellen gerundet, Namen auf 28 Zeichen gekürzt) (`data/chart-features.js`, nur mit `chartbg=1`) | **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**, <https://creativecommons.org/licenses/by-nc/4.0/>. Namensnennung in der App (Fußzeile): „Lufträume: OpenAIP (CC BY-NC 4.0)“. Die App wird kostenlos verbreitet und die Daten werden nicht verkauft. Quelle: <https://www.openaip.net/data/exports> (Länder DE, DK, NL, SE; Umkreis 75 km um HAM, FRA, FMO, CPH). Die Daten wurden nicht verändert, nur ausgewählt, vereinfacht (Douglas-Peucker, 0,2 km) und auf zwei Nachkommastellen gerundet. |
| [Natural Earth](https://www.naturalearthdata.com) | Flüsse und Küsten (`data/geo-features.js`) | Gemeinfrei (Public Domain) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Vorfelder, Rollwege, Terminals, Gates u. a. der Flughäfen (`data/airport-detail.js`) | Daten © OpenStreetMap-Mitwirkende, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |

## Code

### jsfive und pako (Server, `api/radar.js`)

Die Funktion `api/radar.js` liest die DWD-Datei (HDF5) mit der Bibliothek **jsfive** 0.4.2 (<https://github.com/usnistgov/jsfive>, Version fest in `package.json` und `package-lock.json`). jsfive steht laut seiner LICENSE.txt in der Public Domain und basiert auf pyfive (© 2016 Jonathan J. Helmus). Die Datei `dist/esm/index.mjs` von jsfive enthält eine eingebaute Kopie von **pako** 2.1.0 (MIT License, © 2014-2017 Vitaly Puzrin and Andrei Tuputcyn, <https://github.com/nodeca/pako>; Banner: „pako 2.1.0 … @license (MIT AND Zlib)“). Das separate Paket `pako` (2.2.0 laut `package-lock.json`) installiert npm nur, weil jsfive es als Abhängigkeit deklariert; die Funktion lädt es zur Laufzeit nicht. Alles läuft nur auf dem Server, nicht im Browser.

Die Dekompression ist begrenzt: `lib/dwd-radar.js` ersetzt den gzip-Filter von jsfive durch eine Inflate-Funktion mit Obergrenze (die deklarierte Chunkgröße, Node `zlib`), damit eine Dekompressionsbombe nicht unbegrenzt Speicher belegt.

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

## Airline-Abzeichen und Flugzeug-Silhouetten

Es sind **keine** Logos oder Markenzeichen von Fluggesellschaften enthalten und es werden keine Logo-Bilder von Dritten geladen. Die Abzeichen in `js/airlines.js` sind selbst erstellte, flache Farbkacheln mit dem IATA- bzw. ICAO-Code (Codes sind sachliche Kennungen). Die Farben nähern lediglich die Lackierung an, ohne Schriftzug, Bildmarke oder Gestaltung der Marken nachzubilden. Alle Markennamen gehören ihren Inhabern; die Nennung dient nur der Identifikation. Die Flugzeug-Silhouetten in `js/glyphs.js` sind eigene, vereinfachte Vektorformen.

## Schriften

- **IBM Plex Mono** (© IBM Corp.) steht unter der SIL Open Font License 1.1 (<https://openfontlicense.org>). Die Schriften werden vom eigenen Server ausgeliefert; die jeweiligen Copyright-Hinweise und die OFL-Lizenztexte gehören zu den Schriftdateien und müssen bei der Weitergabe mitgeliefert werden.

## Luftfahrtkarte im Hintergrund

Die Option `chartbg=1` ist eine eigene Zeichnung auf Basis der oben genannten offenen Daten (OpenAIP, OurAirports). Es werden **keine** amtlichen oder kommerziellen Luftfahrtkarten (DFS, ICAO, Jeppesen, NACO, Navigraph u. a.) kopiert, nachgezeichnet oder als Vorlage benutzt. Gradnetz, Symbole und Farben sind selbst gestaltet (`js/chart.js`, Farbrollen in `js/styles.js`). Die Karte ist nicht zur Navigation geeignet.
