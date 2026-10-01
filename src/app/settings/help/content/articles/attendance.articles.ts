import { HelpArticle } from '../types';

export const ATTENDANCE_ARTICLES: HelpArticle[] = [
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
    title: 'Erinnerung an Mitglieder senden',
    categoryId: 'attendance',
    keywords: ['erinnerung', 'reminder', 'benachrichtigung senden', 'email', 'neutral', 'ohne status'],
    body: `Für einen Termin kannst du eine Ad-hoc-Erinnerung an Mitglieder senden (z. B. per E-Mail und Push-Benachrichtigung). Öffne dazu im Termin das Menü (⋮) und tippe auf "Erinnerung versenden".

Im Dialog kannst du Betreff und Nachricht frei anpassen. Wenn noch Personen ohne Status ("Neutral") vorhanden sind, erscheint zusätzlich die Option **"Nur Personen ohne Status"**: Damit wird die Erinnerung ausschließlich an jene Personen gesendet, die sich noch nicht zurückgemeldet haben.`,
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
