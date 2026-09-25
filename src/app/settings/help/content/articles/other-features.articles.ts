import { HelpArticle } from '../types';

// Short stub articles for less central features. Expand these into full
// articles as the corresponding feature gets more attention/questions.
export const OTHER_FEATURES_ARTICLES: HelpArticle[] = [
  {
    id: 'other-dashboard',
    title: 'Dashboard',
    categoryId: 'other',
    keywords: ['übersicht', 'kacheln', 'startseite'],
    body: `Das Dashboard zeigt [[Administrator|Administratoren]] und [[Verantwortlicher|Verantwortlichen]] eine Übersicht mit Geburtstagen, dem nächsten Termin, Mitgliederänderungen, Abwesenheiten, [[Kritische Person|kritischen Personen]] und aktuellen Werken.`,
  },
  {
    id: 'other-history',
    title: 'Historie',
    categoryId: 'other',
    keywords: ['gespielte werke', 'aufführungshistorie'],
    body: `Die [[Historie]] listet chronologisch, welches [[Werk]] bei welchem Termin unter welcher Leitung gespielt wurde. Nützlich, um zu sehen, wann ein Stück zuletzt geprobt wurde.`,
  },
  {
    id: 'other-export',
    title: 'Export',
    categoryId: 'other',
    keywords: ['csv', 'excel', 'pdf export', 'daten exportieren'],
    body: `Über "Export" lassen sich Personen- oder Anwesenheitslisten als PDF, Excel oder CSV mit frei wählbaren Spalten exportieren.`,
  },
  {
    id: 'other-stats',
    title: 'Statistiken',
    categoryId: 'other',
    keywords: ['auswertung', 'diagramme', 'anwesenheitsquote'],
    body: `Die Statistik-Seite zeigt Anwesenheitstrends, die Verteilung der [[Anwesenheitsstatus|Anwesenheitsstatus]], Altersverteilung und weitere Auswertungen über einen frei wählbaren Zeitraum.`,
  },
  {
    id: 'other-instruments',
    title: 'Instrumente/Gruppen',
    categoryId: 'other',
    keywords: ['stimmen verwalten', 'sektionen', 'kategorien'],
    body: `Hier verwaltest du die [[Gruppe|Gruppen]]/Stimmen des Vereins, ihre Kategorien und die Reihenfolge, in der sie angezeigt werden.`,
  },
  {
    id: 'other-teachers',
    title: 'Lehrer',
    categoryId: 'other',
    keywords: ['instrumentallehrer', 'unterricht'],
    body: `Unter "Lehrer" können Instrumentallehrer angelegt und mit den von ihnen unterrichteten [[Mitglied|Mitgliedern]] verknüpft werden.`,
  },
  {
    id: 'other-org-plans',
    title: 'Organisationspläne',
    categoryId: 'other',
    keywords: ['org plans', 'gemeinsame planung'],
    body: `Ist deine Instanz Teil einer [[Organisation]], zeigt "Organisationspläne" eine gemeinsame Übersicht aller [[Ablaufplan|Ablaufpläne]] über mehrere Instanzen hinweg.`,
  },
  {
    id: 'other-org-settings',
    title: 'Organisationseinstellungen',
    categoryId: 'other',
    keywords: ['organisation verknüpfen', 'werke teilen'],
    body: `Hier verknüpfst du deine Instanz mit einer [[Organisation]] und legst z. B. fest, aus welcher Instanz die gemeinsame Werke-Bibliothek stammt.`,
  },
  {
    id: 'other-shared-plan',
    title: 'Geteilte und öffentliche Pläne',
    categoryId: 'other',
    keywords: ['plan link', 'öffentlicher link', 'public planung'],
    body: `Über einen geteilten Link können auch Personen ohne Attendix-Konto einen [[Ablaufplan]] ansehen oder live mitverfolgen. Unter "attendix.de/planung" lässt sich sogar ganz ohne Login ein Ad-hoc-Ablaufplan erstellen und teilen.`,
  },
  {
    id: 'other-registration',
    title: 'Anmeldung und Registrierung',
    categoryId: 'other',
    keywords: ['login', 'account erstellen', 'einladungslink'],
    body: `Neue Personen können sich über einen von der Instanz bereitgestellten Registrierungslink selbst anmelden und erscheinen danach als [[Bewerber]], bis ein Administrator die Anmeldung bestätigt.`,
  },
  {
    id: 'other-meetings',
    title: 'Treffen',
    categoryId: 'other',
    keywords: ['besprechung', 'sitzung', 'teamtreffen'],
    body: `Ein [[Treffen]] ist ein eigener Eintrag für Besprechungen der Leitung oder des Teams — getrennt von normalen Proben-/Aufführungsterminen. Erfasst werden Datum, Teilnehmende und Notizen zum Gesprächsinhalt, damit nachvollziehbar bleibt, wann worüber gesprochen wurde.`,
  },
  {
    id: 'other-shifts',
    title: 'Schichtpläne',
    categoryId: 'other',
    keywords: ['schicht', 'arbeitsplan', 'rotierender dienst', 'automatisch entschuldigen'],
    body: `Für Mitglieder, die im Schichtdienst arbeiten (z. B. im Rettungsdienst oder in der Pflege), lassen sich unter "Einstellungen → Allgemein → Schichten" [[Schichtplan|Schichtpläne]] anlegen: wiederkehrende Arbeits-/Frei-Zeitblöcke mit Start, Dauer und Wiederholungsanzahl. Wird einer Person ein Schichtplan zugewiesen, entschuldigt Attendix sie automatisch für alle anstehenden Termine, die in ihre Arbeitszeit fallen — ohne dass sie sich manuell abmelden muss.`,
  },
  {
    id: 'other-handover',
    title: 'Personen übergeben',
    categoryId: 'other',
    keywords: ['übergabe', 'mitglied transferieren', 'zwischen instanzen verschieben'],
    body: `Die [[Übergabe]] verschiebt einzelne Personen von deiner Instanz in eine andere Instanz derselben [[Organisation]] — z. B. wenn jemand von einem Vor- in den Hauptchor wechselt. Du wählst die Personen und die Ziel-Instanz aus, ordnest ihre bisherige [[Gruppe]] einer passenden Gruppe in der Ziel-Instanz zu und entscheidest, ob die Person auch in der Ursprungsinstanz bestehen bleiben soll.`,
  },
  {
    id: 'other-teams',
    title: 'Microsoft Teams Integration',
    categoryId: 'other',
    keywords: ['teams tab', 'microsoft teams', 'kanal'],
    body: `Attendix kann als Tab in einem Microsoft-Teams-Kanal eingebunden werden. Beim Hinzufügen des Tabs wählt die einrichtende Person die gewünschte Instanz aus; danach zeigt der Tab die Daten dieser Instanz direkt im Teams-Kanal an.`,
  },
];
