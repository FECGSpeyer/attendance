import { HelpArticle } from '../types';

export const SELF_SERVICE_ARTICLES: HelpArticle[] = [
  {
    id: 'self-signout',
    title: 'Mich selbst an- oder abmelden',
    categoryId: 'self-service',
    keywords: ['abmelden', 'anmelden', 'meine termine', 'signout', 'anmeldefelder', 'notiz', 'antworten ändern', 'anmeldung bearbeiten'],
    body: `Unter "Meine Anwesenheit" siehst du deine anstehenden und vergangenen Termine und kannst deinen eigenen [[Anwesenheitsstatus]] setzen. Meldest du dich ab, wählst du optional einen [[Ausfallgrund]] aus.

Hat ein Termin Anmeldefelder (z. B. „Essen mit?“), fragt die App sie beim Anmelden ab – auch wenn du „Anmelden mit Notiz“ wählst: Erst gibst du deine Notiz ein, danach füllst du die Anmeldefelder aus.

Bist du schon angemeldet, tippst du den Termin an und wählst „Anmeldefelder anpassen“, um deine Antworten nachträglich zu ändern. Das geht, solange die Anmeldefrist des Termins nicht abgelaufen ist.`,
  },
  {
    id: 'self-pause',
    title: 'Geplante Abwesenheit hinterlegen',
    categoryId: 'self-service',
    keywords: ['pause', 'urlaub eintragen', 'abwesenheit planen', 'zeitraum'],
    body: `Weißt du bereits im Voraus, dass du für einen Zeitraum nicht kannst (z. B. Urlaub), kannst du das mit Von-/Bis-Datum und Grund hinterlegen. Attendix markiert dich für alle betroffenen Termine automatisch als abwesend.`,
  },
  {
    id: 'self-children',
    title: 'Anwesenheit für mein Kind pflegen',
    categoryId: 'self-service',
    keywords: ['eltern', 'kind anmelden', 'parent'],
    body: `Als [[Elternteil]] siehst du unter "Meine Anwesenheit" zusätzlich die Termine deiner Kinder und kannst deren [[Anwesenheitsstatus]] genauso pflegen wie deinen eigenen.`,
  },
];
