import { HelpArticle } from '../types';

export const SELF_SERVICE_ARTICLES: HelpArticle[] = [
  {
    id: 'self-signout',
    title: 'Mich selbst an- oder abmelden',
    categoryId: 'self-service',
    keywords: ['abmelden', 'anmelden', 'meine termine', 'signout'],
    body: `Unter "Meine Anwesenheit" siehst du deine anstehenden und vergangenen Termine und kannst deinen eigenen [[Anwesenheitsstatus]] setzen. Meldest du dich ab, wählst du optional einen [[Ausfallgrund]] aus.`,
  },
  {
    id: 'self-registration-fields',
    title: 'Anmeldefelder ausfüllen und ändern',
    categoryId: 'self-service',
    keywords: ['anmeldefelder', 'zusatzfelder', 'fragen bei anmeldung', 'antworten ändern', 'anmeldung bearbeiten', 'notiz', 'anmelden mit notiz'],
    body: `Hat ein Termin [[Anmeldefelder]] (z. B. "Bringst du einen Kuchen mit?"), fragt Attendix sie ab, sobald du dich unter "Meine Anwesenheit" anmeldest – egal ob über "Anmelden" oder "Anmelden mit Notiz". Bei "Anmelden mit Notiz" gibst du zuerst deine Notiz ein und füllst danach die Anmeldefelder aus.

Bist du schon angemeldet, tippst du auf den Termin und wählst "Anmeldefelder anpassen". Deine bisherigen Antworten sind vorausgefüllt; mit "Speichern" übernimmst du die Änderungen, deine Anmeldung bleibt bestehen. Das geht, solange die Anmeldefrist des Termins nicht abgelaufen ist.`,
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
