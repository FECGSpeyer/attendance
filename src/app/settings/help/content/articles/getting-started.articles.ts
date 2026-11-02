import { HelpArticle } from '../types';

export const GETTING_STARTED_ARTICLES: HelpArticle[] = [
  {
    id: 'gs-overview',
    title: 'Was ist Attendix?',
    categoryId: 'getting-started',
    keywords: ['start', 'einstieg', 'überblick', 'app'],
    body: `Attendix hilft Orchestern, Chören und ähnlichen Gruppen dabei, Anwesenheiten zu erfassen, [[Werk|Werke]] zu verwalten, Proben und Aufführungen zu planen und den Überblick über die Mitglieder zu behalten.

Die App funktioniert im Browser am Laptop genauso wie als App auf dem Smartphone. Was du siehst und darfst, hängt von deiner [[Rolle]] in der aktuellen [[Instanz]] ab.

Für Vorstand oder Leitungsteam gibt es die [[Teamorganisation]]: Tagesordnung im Ablaufplan, Protokoll und Aufgaben, alles direkt am Termin (siehe „Was ist die Teamorganisation?“).`,
  },
  {
    id: 'gs-navigation',
    title: 'Wie ist die App aufgebaut?',
    categoryId: 'getting-started',
    keywords: ['tabs', 'navigation', 'menü', 'übersicht'],
    body: `Auf dem Handy findest du unten in der App je nach [[Rolle]] verschiedene Reiter (Tabs), z. B. Dashboard, Anwesenheit, Mitglieder, Werke und „Mehr“. Auf Tablet und Computer steht die Navigation stattdessen in einer Seitenleiste links (siehe „Seitenleiste auf Tablet und Computer“).

- **Dashboard**: Übersicht mit anstehenden Terminen, Geburtstagen und wichtigen Hinweisen (nur für [[Administrator]] und [[Verantwortlicher]]).
- **Anwesenheit**: Termine anlegen und den [[Anwesenheitsstatus]] der Mitglieder pflegen.
- **Mitglieder**: Personenliste mit [[Stammdaten]].
- **Werke**: Die Notenbibliothek des Vereins.
- **Mehr** bzw. **Einstellungen**: Vereinsdaten, Benachrichtigungen, Rollen und Hilfe.

Mitglieder ohne Verwaltungsrechte sehen stattdessen meist nur "Meine Anwesenheit" und "Werke".`,
  },
  {
    id: 'gs-side-panel',
    title: 'Seitenleiste auf Tablet und Computer',
    categoryId: 'getting-started',
    keywords: ['seitenleiste', 'sidepanel', 'sidebar', 'menü', 'navigation', 'einklappen', 'ausklappen', 'tablet', 'ipad', 'computer', 'abmelden', 'ausloggen', 'tabbar'],
    body: `Auf größeren Bildschirmen ersetzt eine Seitenleiste links die Reiter (Tabs) unten. Darin stehen mehr Bereiche direkt, die auf dem Handy unter „Mehr“ liegen, z. B. Teamorganisation, Ablaufpläne, Dateiablage oder Statistik. Welche Einträge du siehst, hängt von deiner [[Rolle]] ab.

- **Oben**: Mit dem Symbol links oben klappst du die Leiste ein und wieder aus. Eingeklappt bleiben nur die Symbole stehen, so hast du mehr Platz für Inhalte. Am Computer geht das auch mit Strg + B (Mac: ⌘ + B). Deine Wahl merkt sich das Gerät. Rechts daneben ist die Glocke mit deinen Benachrichtigungen.
- **Instanz**: Darunter steht die aktuelle [[Instanz]]. Hast du mehrere, tippst du darauf und wechselst.
- **Zahlen an Einträgen** zeigen, was auf dich wartet: offene Aufgaben bei der [[Teamorganisation]] und, für [[Administrator|Administratoren]] und [[Verantwortlicher|Verantwortliche]], neue Anmeldungen bei „Personen“.
- **Unten**: dein Name (öffnet die Einstellungen mit deinen Daten) und „Ausloggen“.

Hältst du ein Tablet hochkant, ist die Leiste zunächst versteckt. Öffne sie mit dem Menü-Symbol oben links in der Seite oder wische vom linken Rand. Auf dem Handy bleibt alles wie gewohnt bei den Reitern unten.`,
  },
  {
    id: 'gs-switch-instance',
    title: 'Zwischen mehreren Instanzen wechseln',
    categoryId: 'getting-started',
    keywords: ['instanz wechseln', 'verein wechseln', 'mehrere vereine'],
    body: `Wenn dein Konto mit mehreren [[Instanz|Instanzen]] verknüpft ist (z. B. weil du in mehreren Vereinen aktiv bist), kannst du in den Einstellungen über "Instanz wechseln" jederzeit umschalten. Auf Tablet und Computer geht das auch oben in der Seitenleiste: Tippe auf den Namen der Instanz und wähle eine andere aus. Alle angezeigten Daten (Personen, Termine, Werke) beziehen sich immer nur auf die aktuell ausgewählte Instanz.`,
  },
];
