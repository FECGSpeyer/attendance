import { HelpArticle } from '../types';

export const ATTENDANCE_ARTICLES: HelpArticle[] = [
  {
    id: 'att-list-layout',
    title: 'Die Terminübersicht lesen',
    categoryId: 'attendance',
    keywords: ['terminliste', 'termine übersicht', 'ablaufplan öffnen', 'anstehende termine', 'vergangene termine', 'nächster termin', 'prozent', 'durchschnitt', 'monat'],
    body: `Unter "Termine" siehst du als Dirigent oder Helfer oben den Termin von heute (oder den nächsten Termin) als große Karte, mit erwarteter Anwesenheit und wie viele Personen anwesend, entschuldigt oder abwesend sind. Tippe auf die Karte, um die Anwesenheit zu erfassen. Hat der Termin einen Ablaufplan, öffnest du ihn über „Ablaufplan“ direkt in der Karte; läuft der Termin gerade, startet der Plan im Live-Modus. Vor dem ersten Punkt ist dort noch nichts markiert, stattdessen zählt neben „Start“ die Zeit bis zum Beginn herunter. Über den Stift oben rechts kommst du direkt in den Editor, um den Plan zu bearbeiten. In der Liste der anstehenden Termine führt das Plan-Symbol ebenfalls direkt zum Ablaufplan.

Darunter folgen die anstehenden Termine, nach Monaten gruppiert. Links steht das Datum, hervorgehobene Termin-Typen haben eine farbige Datumskachel. Rechts siehst du die Anwesenheit in Prozent: grün ab 75 %, gelb ab 50 %, sonst rot.

Unter „Vergangen“ stehen der Durchschnitt und die letzten drei Termine; mit „Alle anzeigen“ klappst du die ganze Liste auf. Dirigenten können einen Termin wie bisher durch Wischen nach links löschen.`,
  },
  {
    id: 'att-mark-status',
    title: 'Anwesenheit markieren',
    categoryId: 'attendance',
    keywords: ['status ändern', 'anwesend', 'abwesend', 'entschuldigt', 'verspätet'],
    body: `Öffne einen Termin im Bereich "Anwesenheit" und tippe auf den Status neben einer Person, um ihn weiterzuschalten. Der [[Anwesenheitsstatus]] wechselt dabei in einer festen Reihenfolge, z. B. Neutral → Anwesend → Entschuldigt → Verspätet → Abwesend.

Welche Stufen im Zyklus vorkommen, lässt sich pro Termin-Typ in den Einstellungen unter "Allgemein" konfigurieren (z. B. ohne "Verspätet", wenn das für eine Instanz nicht relevant ist).`,
  },
  {
    id: 'att-excuse-reason',
    title: 'Abwesenheit mit Grund entschuldigen',
    categoryId: 'attendance',
    keywords: ['ausfallgrund', 'krank', 'entschuldigung', 'grund auswählen'],
    body: `Beim Setzen des Status "Entschuldigt" oder "Verspätet" kannst du einen [[Ausfallgrund]] bzw. [[Verspätungsgrund]] aus einer vordefinierten Liste auswählen (z. B. "Krankheitsbedingt", "Urlaubsbedingt"). Diese Liste kann pro Instanz in den Einstellungen angepasst werden.`,
  },
  {
    id: 'att-change-date',
    title: 'Termin auf einen anderen Tag verschieben',
    categoryId: 'attendance',
    keywords: ['datum ändern', 'verschieben', 'verlegen', 'anderer tag', 'termin verschieben', 'datum', 'status zurücksetzen'],
    body: `Öffne den Termin, klappe **Allgemein** auf und tippe auf **Datum**. Wähle den neuen Tag und bestätige. Für einen Termin mit Tagesordnung geht das auch in der Teamorganisation im Reiter **Themen** über **Ändern → Datum dieses Termins ändern**.

Haben schon Personen einen anderen Status als den Standardstatus des Typs, fragt Attendix nach: **Zurücksetzen** setzt alle wieder auf den Standardstatus, **Behalten** lässt die bisherigen Rückmeldungen stehen.

Beim Verschieben passiert außerdem:
- Anmeldefrist und Fristen der [[Checkliste]] wandern um dieselbe Zahl an Tagen mit.
- Die Werke des Termins bekommen in der [[Historie]] das neue Datum.
- Schichten werden für den neuen Tag neu geprüft, und eingetragene Abwesenheiten am neuen Tag entschuldigen die betroffenen Personen.`,
  },
  {
    id: 'att-checklist',
    title: 'Checkliste für einen Termin',
    categoryId: 'attendance',
    keywords: ['aufgaben', 'todo', 'frist', 'deadline'],
    body: `Zu jedem Termin kannst du eine [[Checkliste]] mit Aufgaben hinterlegen, z. B. "Noten mitbringen" oder "Raum reservieren". Jeder Punkt kann optional eine Frist relativ zum Termin bekommen (1 Stunde, 1 Tag, 2 Tage oder 1 Woche vorher), damit rechtzeitig erinnert wird.`,
  },
  {
    id: 'att-checklist-deadlines',
    title: 'Fristen bei der Checkliste erkennen',
    categoryId: 'attendance',
    keywords: ['überfällig', 'frist abgelaufen', 'checkliste rot', 'warnung'],
    body: `Hat ein Punkt der [[Checkliste]] eine Frist, zeigt Attendix im Termin sowohl die genaue Uhrzeit als auch eine relative Angabe (z. B. "in 3 Stunden") an. Ist die Frist überschritten und der Punkt noch nicht erledigt, wird er farblich hervorgehoben (Gelb = bald fällig, Rot = überfällig), damit nichts vergessen wird.`,
  },
  {
    id: 'att-songs-plan',
    title: 'Werke zu einem Termin hinzufügen',
    categoryId: 'attendance',
    keywords: ['werke auswählen', 'programm', 'dirigent'],
    body: `Im Termin-Detail kannst du über den Bereich "Werke" gespielte oder geplante [[Werk|Werke]] hinzufügen und eine Leitung (Dirigent/Chorleiter) zuordnen. Diese Einträge landen automatisch in der [[Historie]] und stehen im [[Ablaufplan]] zur Auswahl.`,
  },
  {
    id: 'att-reminder',
    title: 'Erinnerung an Mitglieder senden (Ad-hoc-Erinnerung)',
    categoryId: 'attendance',
    keywords: ['erinnerung', 'reminder', 'ad-hoc', 'adhoc', 'benachrichtigung senden', 'email', 'push', 'neutral', 'ohne status', 'rückmeldung fehlt', 'einzelne person erinnern'],
    body: `Zusätzlich zu den automatischen Terminerinnerungen kannst du jederzeit von Hand an einen Termin erinnern. [[Helfer]] haben diese Funktion nicht.

**An alle erinnern**
Öffne den Termin, tippe auf das Menü (⋮) und dann auf "Erinnerung versenden". Betreff und Nachricht sind mit Termintyp, Datum und Uhrzeit vorausgefüllt und lassen sich frei anpassen. Sind noch Personen ohne Status ("Neutral") im Termin, kannst du mit **"Nur Personen ohne Status"** nur diejenigen erinnern, die sich noch nicht zurückgemeldet haben.

**Eine einzelne Person erinnern**
Wische im Termin eine Person nach links, tippe auf die drei Punkte und wähle "Erinnerung senden". Die Erinnerung geht dann nur an diese Person.

**So kommt die Erinnerung an**
- Per Push (oder Telegram) an alle mit App-Konto, die Benachrichtigungen und "Terminerinnerungen" aktiviert haben. [[Beobachter]] bekommen sie nicht.
- Per E-Mail an Personen des Termins mit hinterlegter E-Mail-Adresse, außer an die [[Hauptgruppe]] und ausgetretene Personen. Ohne "Nur Personen ohne Status" gilt das nur für Personen, die schon einen Status haben. Die E-Mail enthält einen Link direkt zum Termin.
- Wer per E-Mail erinnert wurde und ein App-Konto hat, sieht die Erinnerung auch in der Glocke.

Für allgemeine Nachrichten ohne Terminbezug nutze stattdessen die Mitteilungen (Einstellungen → Kommunikation → Mitteilungen).`,
  },
  {
    id: 'att-options-menu',
    title: 'Optionen und Ansicht im Termin',
    categoryId: 'attendance',
    keywords: ['menü', 'optionen', 'ansicht', 'filter', 'sortierung', 'bilder', 'anmeldefelder', 'status filter', 'zusatzfelder'],
    body: `Das Menü (⋮) oben rechts im Termin enthält mehrere Unterbereiche:

**Status-Filter** – Blendet nur Personen mit bestimmten Statuswerten ein (z. B. nur Abwesende). Aktive Filter werden durch einen farbigen Zähler am Menü-Button angezeigt.

**Sortierung** – Sortiert die Personenliste nach einem [[Zusatzfeld]] (Personen- oder Anmeldefelder), jeweils auf- oder absteigend (↑ / ↓). Ohne aktive Sortierung gilt die Standard-Gruppen-Reihenfolge. Der sortierte Feldwert und die Gruppe werden als Zusatzinfo unter dem Namen eingeblendet.

**Ansicht** – Steuert, was im Termin sichtbar ist:
- *Bilder anzeigen* – Zeigt Profilbilder neben den Namen an.
- *Anmeldefelder anzeigen* – Blendet die Antworten auf [[Anmeldefelder]] unter den Namen ein oder aus (nur sichtbar, wenn der Termin-Typ Anmeldefelder hat).
- *Explizite Statusauswahl* – Wechselt in einen Modus, bei dem jede Person ein Dropdown zur Statusauswahl zeigt, statt beim Antippen den Status weiterzuschalten.`,
  },
];
