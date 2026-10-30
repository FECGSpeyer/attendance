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
    keywords: ['suche', 'filter', 'schwierigkeit', 'zuletzt gespielt', 'zuletzt gesungen', 'geplant', 'noch nicht gesungen', 'präfix', 'liedbuch', 'nachladen', 'scrollen'],
    body: `Die Werkeliste kann per Suchfeld (Titel, Nummer oder Präfix mit Nummer, z. B. "LB12") sowie nach Instrument, Schwierigkeitsgrad oder Datum des letzten Auftritts gefiltert werden. So findest du schnell z. B. alle Stücke, die lange nicht mehr gespielt wurden. Unter jedem Werk siehst du, wann es zuletzt gesungen bzw. gespielt wurde. Ist es schon für einen künftigen Termin eingeplant, steht dort zusätzlich "Geplant am …", bei neuen Werken "Noch nicht gesungen · Geplant am …". Für "Zuletzt gesungen" und die Sortierung zählen nur Termine, die bereits stattgefunden haben. Bei großen Listen zeigt Attendix zuerst die ersten 100 Werke und lädt beim Herunterscrollen automatisch weitere nach.`,
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
  {
    id: 'songs-sync',
    title: 'Werke mit einer anderen Instanz teilen (Werk-Synchronisierung)',
    categoryId: 'songs',
    keywords: ['werk-synchronisierung', 'synchronisieren', 'quellinstanz', 'werke teilen', 'gemeinsame werke', 'werke zusammenführen', 'werk löschen'],
    body: `Verknüpfte [[Instanz|Instanzen]] können eine gemeinsame Werkbibliothek nutzen. Als Super-Admin wählst du dafür unter "Organisation → Werk-Synchronisierung" eine Quellinstanz aus. Deine Instanz zeigt dann die Werke, Kategorien und Notendateien der Quellinstanz an, und alle Änderungen werden dort gespeichert. Termine und Historie bleiben pro Instanz getrennt.

Wichtig beim Löschen: Ein Werk gibt es nur einmal für alle beteiligten Instanzen. Löschst du es, ist es überall weg, inklusive der Historie aller Instanzen. Attendix weist dich beim Löschen darauf hin und nennt die betroffenen Instanzen.`,
  },
  {
    id: 'songs-org-search',
    title: 'Werke in der Organisation suchen und kopieren',
    categoryId: 'songs',
    keywords: ['organisation', 'andere instanz', 'werk kopieren', 'werk übernehmen', 'organisationsweit', 'suchen', 'noten übernehmen', 'doppelt', 'duplikat'],
    body: `Als [[Administrator]] oder [[Verantwortlicher]] kannst du die Werke aller anderen [[Instanz|Instanzen]] deiner [[Organisation]] durchsuchen. Du findest die Suche unter "Organisation → Werke in der Organisation suchen" oder in der Werkeliste über das Menü (drei Punkte) → "In der Organisation suchen".

Suche nach Name oder Nummer und grenze bei Bedarf auf einzelne Instanzen oder Werke mit Dateien ein. "Schon bei dir" zeigt, dass es in deiner Instanz bereits ein Werk mit diesem Namen gibt.

Tippst du auf ein Werk, wählst du die Zielinstanz. Ziel kann jede Instanz sein, in der du Admin oder Verantwortlicher bist. Gibt es dort schon ein Werk mit gleichem Namen, warnt Attendix und schlägt vor, in das vorhandene Werk zu kopieren. Dann werden die ausgewählten Dateien ergänzt und leere Felder gefüllt. Felder mit vorhandenem Wert werden nur überschrieben, wenn du sie bewusst ankreuzt. Legst du ein neues Werk an und die Nummer ist schon vergeben, kannst du sie ändern oder die nächste freie Nummer übernehmen.

Du kannst Felder und Dateien einzeln abwählen und für jede Datei die [[Gruppe]] im Ziel festlegen. Attendix ordnet sie vorher anhand von Namen und Synonymen zu. Die Dateien werden kopiert und gehören danach der Zielinstanz, spätere Änderungen im Original kommen nicht automatisch an. Fehlende Kategorien werden angelegt, [[Zusatzfeld|Zusatzfelder]] werden übernommen, wenn es im Ziel ein Feld mit gleichem Namen gibt. Am kopierten Werk steht, aus welcher Instanz es stammt.`,
  },
];
