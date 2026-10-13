import { HelpArticle } from '../types';

export const SONGS_ARTICLES: HelpArticle[] = [
  {
    id: 'songs-add',
    title: 'Werk anlegen',
    categoryId: 'songs',
    keywords: ['stück hinzufügen', 'notenbibliothek', 'neues werk'],
    body: `Unter "Werke" legst du ein neues [[Werk]] mit Nummer, Namen, Schwierigkeitsgrad und Kategorien an. Optional lassen sich zu jeder [[Gruppe]]/Stimme passende Notendateien (PDF) hinterlegen.`,
  },
  {
    id: 'songs-filter',
    title: 'Werke suchen und filtern',
    categoryId: 'songs',
    keywords: ['suche', 'filter', 'schwierigkeit', 'zuletzt gespielt'],
    body: `Die Werkeliste kann per Suchfeld (Titel/Nummer) sowie nach Instrument, Schwierigkeitsgrad oder Datum des letzten Auftritts gefiltert werden. So findest du schnell z. B. alle Stücke, die lange nicht mehr gespielt wurden.`,
  },
  {
    id: 'songs-import',
    title: 'Werke importieren',
    categoryId: 'songs',
    keywords: ['massenimport', 'liste importieren', 'csv'],
    body: `Größere Werkelisten lassen sich per Import einspielen. Attendix versucht dabei, Instrumente/Stimmen anhand von Dateinamen automatisch den passenden [[Gruppe|Gruppen]] zuzuordnen.`,
  },
  {
    id: 'songs-export-pdf',
    title: 'Werkverzeichnis als PDF exportieren',
    categoryId: 'songs',
    keywords: ['pdf export', 'werkverzeichnis drucken', 'liste exportieren', 'pdf'],
    body: `Über das Menü (drei Punkte oben rechts) kannst du das aktuelle Werkverzeichnis als PDF exportieren. Die aktuell gefilterte und sortierte Liste wird exportiert – inklusive aller sichtbaren Spalten wie Schwierigkeitsgrad, Zuletzt gesungen und benutzerdefinierte Felder.`,
  },
  {
    id: 'songs-group-directory',
    title: 'Gruppenverzeichnis und Notenmappe drucken',
    categoryId: 'songs',
    keywords: ['gruppenverzeichnis', 'notenmappe', 'stimme', 'noten einer gruppe', 'partitur', 'dirigenten', 'drucken'],
    body: `Über "Gruppenverzeichnis" in der Werkeliste wählst du eine [[Gruppe]] aus und siehst alle Notendateien, die für diese Gruppe hinterlegt sind. Mit dem Drucker-Symbol oben rechts druckst du die komplette Notenmappe der Gruppe auf einmal.

Sind Partituren hinterlegt, gibt es zusätzlich die Gruppe "Dirigenten", die alle Partituren enthält. Das Gruppenverzeichnis ist auch verfügbar, wenn deine Instanz keine Werkkategorien verwendet.`,
  },
];
