import { HelpArticle } from '../types';

export const TEAM_ORGANIZATION_ARTICLES: HelpArticle[] = [
  {
    id: 'team-overview',
    title: 'Was ist die Teamorganisation?',
    categoryId: 'team',
    keywords: ['teamorganisation', 'vorstand', 'leitungsteam', 'sitzung', 'besprechung', 'meeting', 'gremium', 'ausschuss', 'überblick'],
    body: `Mit der [[Teamorganisation]] bereitest du Sitzungen vor, schreibst das Protokoll und behältst die Aufgaben danach im Blick, zum Beispiel für den Vorstand, das Leitungsteam oder die Dirigentenbesprechung.

Sie besteht aus vier Teilen, die alle am **Termin** hängen:

- **Themen:** Im [[Themenspeicher]] sammelt die Leitung, was besprochen werden soll. Mitglieder können Themen vorschlagen.
- **Tagesordnung:** Ein Thema kommt auf die Tagesordnung, indem du es in den Ablaufplan eines Termins aufnimmst. Dort wird es ein eigener [[TOP]] mit Uhrzeit, Dauer und Verantwortlichem. Der Ablaufplan *ist* also die Tagesordnung, und sein PDF-Export ist die Einladung.
- **Protokoll:** Während der Sitzung schreibst du zu jedem Punkt des Ablaufplans mit und hältst das Ergebnis fest. Nach der [[Protokoll freigeben|Freigabe]] können alle im [[Personenkreis]] es lesen.
- **Aufgaben:** Was bis wann zu tun ist, legst du direkt im Protokoll an. Jede Person sieht ihre Aufgaben selbst und hakt sie ab.

Die Teamorganisation ist nur sichtbar, wenn sie bei mindestens einem Termintyp eingeschaltet ist (siehe „Teamorganisation einschalten“). Du findest sie dann unter **Mehr → Planung → Teamorganisation**.`,
  },
  {
    id: 'team-activate',
    title: 'Teamorganisation einschalten',
    categoryId: 'team',
    keywords: ['aktivieren', 'einschalten', 'freischalten', 'protokoll aktivieren', 'tagesordnung aktivieren', 'termintyp', 'protokoll & tagesordnung', 'nicht sichtbar', 'fehlt'],
    body: `Die Teamorganisation wird pro Termintyp eingeschaltet. Das dürfen [[Administrator|Administratoren]] und [[Verantwortlicher|Verantwortliche]].

1. Öffne **Mehr → Einstellungen → Anwesenheits-Typen** und tippe auf den Typ, für den du Protokolle schreiben willst, z. B. „Vorstandssitzung“. Lege dafür gern einen eigenen Termintyp an.
2. Schalte **„Protokoll & Tagesordnung“** ein.
3. Lege die **relevanten Gruppen** fest. Sie bestimmen den [[Personenkreis]]: Wer in diesen Gruppen ist, kann freigegebene Protokolle lesen und Themen vorschlagen. Ohne Gruppen gehören alle Mitglieder dazu.
4. Optional: Stelle die **Standarddauer pro Thema** ein und ob **vertagte Themen** beim Einplanen oben vorgeschlagen werden.
5. Füge im Standard-Ablaufplan des Typs die Markierung **„Tagesordnung“** an der Stelle ein, an der neue Themen landen sollen.

Sobald ein Typ eingeschaltet ist, erscheint **Mehr → Planung → Teamorganisation**, für die Leitung die Karte „Meine Aufgaben“ auf dem Dashboard und bei Terminen dieses Typs die Protokoll-Karte. Schaltest du es bei allen Typen wieder aus, verschwindet die Teamorganisation; die Daten bleiben erhalten.`,
  },
  {
    id: 'team-prepare',
    title: 'Themen sammeln und eine Sitzung vorbereiten',
    categoryId: 'team',
    keywords: ['thema', 'themen', 'themenspeicher', 'tagesordnung', 'top', 'tagesordnungspunkt', 'agenda', 'einladung', 'einplanen', 'aufnehmen', 'vertagt', 'dauer', 'entfernen', 'herausnehmen', 'termin ändern', 'termin wechseln', 'termin anlegen', 'ad hoc', 'sitzung anlegen'],
    body: `**Themen sammeln:** Unter **Mehr → Planung → Teamorganisation → Themen** legt die Leitung mit **+** neue Themen an, mit Beschreibung, Priorität, verantwortlicher Person und Dauer. Das geht auch Wochen vor der Sitzung, ein Thema gehört erst zu einem Termin, wenn du es einplanst.

**Themen in den Ablaufplan aufnehmen:** Es gibt vier Wege:

- Öffne den Termin und tippe im Ablaufplan auf **„Themen aufnehmen“**. Wähle die Themen aus und passe bei Bedarf die Dauer an. Vertagte Themen stehen oben.
- Öffne ein Thema und tippe auf **„Einplanen“**, um es in einen der nächsten Termine zu übernehmen. Passt keiner, tippst du dort auf **„Neuen Termin anlegen“**: Typ und Datum wählen, und das Thema landet direkt im neuen Termin.
- Im Reiter **Themen** der Teamorganisation tippst du beim nächsten Termin auf **„Themen aufnehmen“**. Mit **„Ändern“** wählst du stattdessen einen späteren Termin oder verschiebst den Termin auf einen anderen Tag. Steht noch keiner an, legst du dort mit **„Termin anlegen“** (oder „Ändern → Neuen Termin anlegen“) ad hoc einen an: Typ wählen (bei mehreren Typen mit Protokoll), Datum wählen, fertig. Der Termin wird wie gewohnt für alle Personen des Typs angelegt.
- Während der Sitzung fügst du im Protokoll mit **„+ Punkt“** spontan ein neues Thema hinzu.

Jedes Thema wird ein eigener [[TOP]] an der Markierung „Tagesordnung“ (ohne Markierung am Ende des Plans). Die Uhrzeiten der folgenden Punkte verschieben sich um seine Dauer.

**Thema wieder aus einem Termin nehmen:** Hat sich etwas geändert, tippe im Reiter **Themen** beim Termin auf den TOP und dann auf **„Aus diesem Termin entfernen“**. Oder öffne **„Themen aufnehmen“** und entferne den Haken bei einem Thema, das schon im Ablaufplan steht. Das Thema bleibt im Themenspeicher und lässt sich später wieder einplanen. Der Papierkorb in der Detailansicht eines Themas löscht es dagegen komplett.

**Einladung verschicken:** Teile den Ablaufplan wie gewohnt als PDF oder per Telegram. Die Themen erscheinen dort als „TOP 1, TOP 2, …“ mit Uhrzeit und Verantwortlichem.

**Verlauf eines Themas:** In der Detailansicht eines Themas siehst du, in welchen Sitzungen es auf der Tagesordnung stand und mit welchem Ergebnis.`,
  },
  {
    id: 'team-protocol',
    title: 'Protokoll schreiben und freigeben',
    categoryId: 'team',
    keywords: ['protokoll', 'mitschrift', 'notizen', 'thema erledigt', 'abschließen', 'live', 'sitzung', 'besprochen', 'beschlossen', 'vertagt', 'ergebnis', 'freigeben', 'veröffentlichen', 'tablet', 'laptop', 'pdf', 'allgemeine notizen', 'spaltenbreite', 'spalten', 'breite anpassen'],
    body: `Das Protokoll schreiben [[Administrator|Administratoren]] und [[Verantwortlicher|Verantwortliche]]. Öffne den Termin und tippe in der Protokoll-Karte auf **„Sitzung starten & protokollieren“**.

**Aufbau:** Das Protokoll hat genau einen Abschnitt pro Punkt des Ablaufplans, in derselben Reihenfolge. Bei jedem [[TOP]] hältst du das Ergebnis fest: **Besprochen**, **Beschlossen** oder **Vertagt**. Vertagte Themen werden beim nächsten Termin desselben Typs wieder vorgeschlagen. Tippe in das umrandete Feld, um Notizen zu schreiben. Zum Formatieren (fett, Überschrift, Liste) markierst du Text, dann erscheint eine kleine Leiste.

**Notizen:**
- *Zum Punkt:* direkt im jeweiligen Abschnitt.
- *Allgemein* (z. B. „Paul kommt später“): auf dem Handy über den Button **„Notizen“** unten, auf Tablet und Laptop in der rechten Spalte, die immer sichtbar ist.

**Tablet und Laptop:** Ab einer gewissen Breite siehst du links die Tagesordnung, in der Mitte den gewählten Punkt und rechts die allgemeinen Notizen. Die Breite der linken und rechten Spalte kannst du anpassen: Zieh die Trennlinie zwischen zwei Spalten mit der Maus oder dem Finger. Ein Doppelklick auf die Linie setzt die Breite zurück. Die App merkt sich deine Einstellung auf diesem Gerät. Mit **Strg/⌘ + ↓** springst du zum nächsten Punkt.

**Live:** Läuft die Sitzung gerade, zeigt das Protokoll an, welcher Punkt laut Ablaufplan dran ist und wie viel Zeit noch bleibt.

**Speichern:** Alles wird automatisch gespeichert, Abschnitt für Abschnitt. Mehrere Personen können gleichzeitig in verschiedenen Abschnitten schreiben.

**Freigeben:** Tippe auf **„Freigeben“**. Danach können alle im [[Personenkreis]] des Termintyps das Protokoll lesen. Anwesende und Personen mit Aufgaben aus der Sitzung werden benachrichtigt und bekommen das Protokoll auf Wunsch zusätzlich als PDF. Im Freigabe-Fenster siehst du außerdem alle offenen Themen, die **beschlossen** oder **besprochen** wurden: Beschlossene sind schon zum Abhaken als erledigt vorausgewählt, besprochene nicht. Passe die Häkchen an, bevor du freigibst. Du kannst ein freigegebenes Protokoll weiter bearbeiten; es zeigt dann „geändert am …“.

Die Anwesenden kommen aus der Anwesenheit des Termins.`,
  },
  {
    id: 'team-tasks',
    title: 'Aufgaben verteilen und erledigen',
    categoryId: 'team',
    keywords: ['aufgabe', 'aufgaben', 'to-do', 'todo', 'zuweisen', 'verantwortlich', 'fällig', 'fälligkeit', 'erinnerung', 'überfällig', 'abhaken', 'erledigt', 'meine aufgaben'],
    body: `**Aufgaben anlegen** darf die Leitung: im Protokoll mit **„Aufgabe“** bei einem Punkt, in einem Thema oder unter **Mehr → Planung → Teamorganisation → Aufgaben** mit **+**. Eine Aufgabe kann jeder aktiven Person der Instanz zugewiesen werden, mit Fälligkeit und Priorität (Niedrig, Mittel oder Hoch).

**Benachrichtigungen:** Die verantwortliche Person bekommt eine Nachricht, wenn ihr eine Aufgabe zugewiesen wird, eine Erinnerung zwei Tage vor Fälligkeit und einmalig eine Nachricht, wenn die Aufgabe überfällig ist. Abschalten kannst du das in den Benachrichtigungs-Einstellungen unter „Aufgaben“.

**Eigene Aufgaben sehen:**
- *Leitung:* Karte **„Meine Aufgaben“** auf dem Dashboard.
- *Mitglieder:* Block **„Meine Aufgaben“** oben auf „Meine Termine“ und unter **Mehr → Planung → Meine Aufgaben**.

**Erledigen:** Tippe auf den Kreis vor der Aufgabe. Mitglieder können bei ihren Aufgaben nur den Status ändern, Titel, Fälligkeit und Person ändert die Leitung.

**Übersicht der Leitung:** Unter Teamorganisation → Aufgaben sind alle Aufgaben nach Fälligkeit gruppiert (überfällig, diese Woche, später, ohne Datum) und lassen sich nach Person filtern. Erledigte Aufgaben werden nach 30 Tagen ausgeblendet; mit „Ältere erledigte anzeigen“ holst du sie zurück.`,
  },
  {
    id: 'team-suggest',
    title: 'Themen vorschlagen',
    categoryId: 'team',
    keywords: ['vorschlag', 'vorschlagen', 'thema vorschlagen', 'idee', 'anliegen', 'einreichen', 'mitglied'],
    body: `Alle im [[Personenkreis]] eines Termintyps mit „Protokoll & Tagesordnung“ können Themen vorschlagen, [[Elternteil|Eltern]] und [[Bewerber]] nicht.

1. Öffne **Mehr → Planung → Thema vorschlagen**.
2. Gib einen Titel und optional eine kurze Beschreibung ein und sende den Vorschlag ab.

Die Leitung sieht neue Vorschläge in der Teamorganisation unter **Themen** und kann sie übernehmen oder ablehnen, auf Wunsch mit einer kurzen Begründung. Du bekommst eine Nachricht, wie entschieden wurde, und siehst den Stand („Wartet“, „Übernommen“, „Abgelehnt“) jederzeit in deiner Liste. Übernommene Vorschläge landen im [[Themenspeicher]].`,
  },
  {
    id: 'team-visibility',
    title: 'Wer sieht was in der Teamorganisation?',
    categoryId: 'team',
    keywords: ['rechte', 'berechtigung', 'sichtbar', 'lesen', 'personenkreis', 'wer darf', 'mitglieder', 'leitung', 'gruppen'],
    body: `- **Leitung** ([[Administrator|Administratoren]] und [[Verantwortlicher|Verantwortliche]]): sieht und bearbeitet alle Themen, Tagesordnungen, Protokolle (auch Entwürfe) und Aufgaben.
- **[[Personenkreis]] eines Termintyps:** liest die freigegebenen Protokolle dieses Typs, kann Themen vorschlagen und sieht die eigenen Vorschläge.
- **Jede Person mit einer Aufgabe:** sieht ihre eigenen Aufgaben und kann sie abhaken, auch außerhalb des Personenkreises.
- **[[Elternteil|Eltern]] und [[Bewerber]]** sehen die Teamorganisation nicht.

Der Personenkreis ergibt sich aus den **relevanten Gruppen** des Termintyps. Hat der Typ keine Gruppen, gehören alle Mitglieder dazu. Eine eigene Rollen-Berechtigung dafür gibt es nicht.

Entwürfe sind nur für die Leitung sichtbar, erst nach der Freigabe sieht der Personenkreis das Protokoll.`,
  },
  {
    id: 'team-meetings-migration',
    title: 'Besprechungen und Protokolle',
    categoryId: 'team',
    keywords: ['besprechungen', 'meetings', 'alte besprechungen', 'migration', 'wo sind', 'protokolle früher', 'besprechung termin', 'termintyp besprechung'],
    body: `Früher gab es in den Einstellungen den Bereich „Besprechungen“ mit freien Notizen. Neue Sitzungen protokollierst du jetzt mit der Teamorganisation: Das Protokoll hängt am Termin und übernimmt die Tagesordnung aus dem Ablaufplan.

Bereits übernommene Besprechungen findest du als Protokolle unter **Mehr → Planung → Teamorganisation → Protokolle**, ihre Notizen stehen dort unter „Allgemeine Notizen“. Jede übernommene Besprechung hängt an einem eigenen Termin vom Typ **„Besprechung“** am selben Tag. Diesen Typ haben wir in Instanzen ohne Protokoll-Typ angelegt; relevant ist dort nur die Hauptgruppe, und der Ablaufplan enthält schon den Platzhalter für die Tagesordnung. Unter **Mehr → Einstellungen → Anwesenheits-Typen** kannst du ihn anpassen. Den alten Bereich „Besprechungen“ gibt es nicht mehr.`,
  },
];
