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
    keywords: ['erinnerung', 'reminder', 'benachrichtigung senden', 'email'],
    body: `Für einen Termin kannst du eine Ad-hoc-Erinnerung an Mitglieder senden (z. B. per E-Mail), die sich noch nicht zurückgemeldet haben. Das ist besonders hilfreich kurz vor der Anmeldefrist, wenn viele Status noch auf "Neutral" stehen.`,
  },
];
