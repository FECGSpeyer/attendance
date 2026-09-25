import { HelpArticle } from '../types';

export const GETTING_STARTED_ARTICLES: HelpArticle[] = [
  {
    id: 'gs-overview',
    title: 'Was ist Attendix?',
    categoryId: 'getting-started',
    keywords: ['start', 'einstieg', 'überblick', 'app'],
    body: `Attendix hilft Orchestern, Chören und ähnlichen Gruppen dabei, Anwesenheiten zu erfassen, [[Werk|Werke]] zu verwalten, Proben und Aufführungen zu planen und den Überblick über die Mitglieder zu behalten.

Die App funktioniert im Browser am Laptop genauso wie als App auf dem Smartphone. Was du siehst und darfst, hängt von deiner [[Rolle]] in der aktuellen [[Instanz]] ab.`,
  },
  {
    id: 'gs-navigation',
    title: 'Wie ist die App aufgebaut?',
    categoryId: 'getting-started',
    keywords: ['tabs', 'navigation', 'menü', 'übersicht'],
    body: `Unten in der App findest du je nach [[Rolle]] verschiedene Reiter (Tabs), z. B. Dashboard, Anwesenheit, Mitglieder, Werke und Einstellungen.

- **Dashboard**: Übersicht mit anstehenden Terminen, Geburtstagen und wichtigen Hinweisen (nur für [[Administrator]] und [[Verantwortlicher]]).
- **Anwesenheit**: Termine anlegen und den [[Anwesenheitsstatus]] der Mitglieder pflegen.
- **Mitglieder**: Personenliste mit [[Stammdaten]].
- **Werke**: Die Notenbibliothek des Vereins.
- **Einstellungen**: Vereinsdaten, Benachrichtigungen, Rollen und Hilfe.

Mitglieder ohne Verwaltungsrechte sehen stattdessen meist nur "Meine Anwesenheit" und "Werke".`,
  },
  {
    id: 'gs-switch-instance',
    title: 'Zwischen mehreren Instanzen wechseln',
    categoryId: 'getting-started',
    keywords: ['instanz wechseln', 'verein wechseln', 'mehrere vereine'],
    body: `Wenn dein Konto mit mehreren [[Instanz|Instanzen]] verknüpft ist (z. B. weil du in mehreren Vereinen aktiv bist), kannst du in den Einstellungen über "Instanz wechseln" jederzeit umschalten. Alle angezeigten Daten (Personen, Termine, Werke) beziehen sich immer nur auf die aktuell ausgewählte Instanz.`,
  },
];
