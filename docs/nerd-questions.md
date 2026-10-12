# Fragen an Nerds (P3.1)

Stand: 2026-10-12 · Zweck: konkrete Fragen, die mit Ja/Nein oder einem Typ beantwortbar sind. Antworten landen in `docs/nerd-feedback.md` (P3.3). Die Fragen werden nicht veröffentlicht; das ist Teil der Freigabe (P3.2).

Bezugspunkte im Code: Pisten und Schwellen aus OSM (`data/airport-detail.js`), Typen-Glyphen (`js/glyphs.js`), Stile (`js/styles.js`). Eine Frage nennt den Stand, gegen den geprüft wird, wenn das für die Antwort wichtig ist.

## EDDH (Hamburg)

1. Hat EDDH zwei Start- und Landebahnen, die Bahnen 05/23 und 15/33? (Ja / Nein)
2. Ist die Bahn 15/33 in der Anzeige der Ansicht Flughafen als Pistenlinie mit der richtigen Richtung zu sehen? (Ja / Nein / Richtung falsch)
3. Stimmen Lage und Ausrichtung der Bahn 05/23 in der Anzeige mit dem Flughafen überein, den du kennst? (Ja / Nein / nur ungefähr)
4. Stimmt die Lage der Bahn 15/33 in der Anzeige mit dem Flughafen überein, den du kennst? (Ja / Nein / nur ungefähr)
5. Welche Bahn wird bei dir in der Betriebsrichtung angezeigt, wenn der METAR-Wind aus West kommt? (Typ: Bahnnummer / weiß nicht; Kontrolle der Betriebsrichtung)
6. Welche ILS-Anflüge kennst du für EDDH? (Auswahl: 15, 23, 05, 33, keine, weiß nicht)

## EDHI (Finkenwerder)

8. Hat EDHI eine Start- und Landebahn, 05/23, und keine zweite? (Ja / Nein / anders: ____)
9. Stimmt die Länge der Bahn im Bild der Ansicht Flughafen ungefähr mit der echten Bahn überein? (Ja / Nein / zu kurz / zu lang)
10. Sind die beiden Segmente östlich und westlich der Bahn (ohne Bezeichnung) Rollwege oder Pistenteile? (Typ: Rollweg / Piste / Grasstreifen / weiß nicht)
11. Gibt es bei EDHI einen veröffentlichten Instrumentenanflug? (Ja / Nein / weiß nicht)

## Typen (Silhouetten)

12. Welcher Typ fehlt dir in der Anzeige? (Freitext, ICAO-Code wenn bekannt, z. B. B350)
13. Welche Silhouette hat der King Air 350 (B350) in der Anzeige: Turboprop (erwartet), Regionaljet oder anderes? (Typ: prop / regional / biz / anderes)
14. Gehört der Global 5000 (GL5T) zu den Geschäftsreiseflugzeugen in der Anzeige? (Ja / Nein)
15. Wird der Super Hornet (F18S) als Kampfflugzeug gezeichnet? (Ja / Nein / wird als Verkehrsflugzeug gezeichnet)
16. Welche Art Ballon oder Segelflugzeug taucht bei dir im Radar auf, und wie wird er gezeichnet? (Freitext, Typ: Ballon / Segelflugzeug / Ultraleicht / anderes)

## Stile

17. Fehlt dir ein Stil für Militär- oder Behördenverkehr? (Ja / Nein)
18. Welcher Stil fehlt dir am meisten? (Typ: Luftfahrtkarte / Glascockpit / Tafel / Schwarz-Weiß / anderes: ____)
19. Ist die Schrift der Tafel (Standard: mono) lesbar auf deinem Fernseher aus zwei Metern? (Ja / Nein / zu klein / zu groß)

## Hinweise zur Auswertung

- Die Fragen 1 bis 11 betreffen Korrektheit. Antworten dazu sind keine Freigabe für eine Datenänderung. Jede Änderung braucht eine Quelle (siehe `docs/corrections-airports.md`).
- Die Fragen 12 bis 16 sammeln Typen. Bei einer Angabe wird geprüft, ob die Zuordnung in `js/glyphs.js` passt.
- Die Fragen 17 bis 19 betreffen den Stil. Neue Stile sind außerhalb des Scopes, solange keine Nerd-Nachfrage vorliegt (Plan, Abschnitt Außerhalb des Scopes).
