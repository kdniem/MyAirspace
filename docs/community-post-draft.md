# Post-Entwurf: MyAirspace (P3.2)

**Entwurf, nicht veröffentlicht; Freigabe ausstehend.**

Dieser Text wird nicht gepostet. Die Veröffentlichung braucht die Freigabe des Repo-Eigentümers. Vor einem Post müssen die Ziel-Communities selbst gelesen werden: Die Regeln dieser Foren oder Subreddits sind in diesem Entwurf **nicht** geprüft und nicht zugesichert. Ob ein Eigenwerbe-Post, ein Screenshot oder ein Demo-Link dort erlaubt ist, muss vorher geklärt werden.

Vor der Veröffentlichung fehlen: ein Screenshot (noch nicht erstellt, Platzhalter unten), die Antworten auf die offenen Fragen aus `docs/nerd-questions.md`, und die Freigabe.

---

## Titel (Vorschlag)

MyAirspace: ein Ambient-Radar für den Fernseher, Demo ohne Standort

## Text

Hallo zusammen,

ich habe MyAirspace gebaut: eine Radar-Anzeige für den Fernseher oder einen Monitor, die Flugverkehr um einen Standort zeigt. Sie läuft im Browser, ohne Installation und ohne Konto, und ist in der Anzeige ruhig gehalten, damit sie den ganzen Tag laufen kann.

Was sie zeigt:

- Flugzeuge im Umkreis, mit Rufzeichen, Flughöhe, Geschwindigkeit, Typ und Silhouette
- eine Tafel mit dem gerade ausgewählten Flugzeug
- optional die Betriebsrichtung und das METAR des Heimatflughafens
- verschiedene Darstellungsstile

Die Daten kommen von offenen ADS-B-Quellen (adsb.lol als Standard). Die App fragt nur die Position ab, die du in der Adresse angibst, gerundet auf etwa einen Kilometer.

**Demo ohne eigene Position:** Mit diesem Link siehst du die Anzeige sofort, ohne Standort und mit simulierten Flugzeugen:

https://kdniem.github.io/MyAirspace/?demo=1

[Screenshot: noch zu erstellen]

Mich interessiert vor allem Feedback von Leuten, die sich mit Luftfahrt auskennen: Stimmen Pisten und Anflüge an deinem Flughafen? Fehlt ein Flugzeugtyp, oder sieht eine Silhouette falsch aus? Welcher Darstellungsstil fehlt? Konkrete Hinweise nehme ich gern entgegen.

Die Quellen, der Code und die Lizenzen stehen im Repository: https://github.com/kdniem/MyAirspace

Viele Grüße

---

## Hinweise für die Freigabe

- Der Link zeigt die Demo mit simulierten Daten. Eine Aussage über echten Verkehr im Demo-Modus gibt es nicht.
- Keine Aussage über Richtigkeit der Piste- oder Anfluglinien, bis `docs/corrections-airports.md` abgeschlossen ist.
- Keine Aussage über Rechte, Regeln oder Erlaubnisse einer Community.
- Keine Werbung, keine Aufforderung zum Teilen, kein Versprechen.
