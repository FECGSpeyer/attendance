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
    id: 'other-messages',
    title: 'Mitteilungen',
    categoryId: 'other',
    keywords: ['nachricht', 'rundmail', 'rundschreiben', 'info an alle', 'gelesen', 'lesebestätigung', 'newsletter'],
    body: `Mit Mitteilungen schicken [[Administrator|Administratoren]] und [[Verantwortlicher|Verantwortliche]] eine formatierte Nachricht an alle aktiven [[Mitglied|Mitglieder]] (inkl. [[Hauptgruppe]]) oder nur an bestimmte [[Gruppe|Gruppen]]. Du findest sie unter Einstellungen → Kommunikation → Mitteilungen.

Versand:
- Per Push (oder Telegram), wenn die Person Benachrichtigungen und "Mitteilungen" aktiviert hat.
- Per E-Mail an alle Personen mit hinterlegter E-Mail-Adresse.
- Zusätzlich erscheint die Mitteilung im Benachrichtigungscenter der App.

Zu jeder Mitteilung siehst du pro Person, ob sie in der App gelesen wurde, ob Push und E-Mail zugestellt wurden und ob die E-Mail geöffnet wurde. "E-Mail geöffnet" ist ein Schätzwert, weil manche Mail-Apps Bilder vorab laden oder blockieren.`,
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
    id: 'other-main-group',
    title: 'Wofür ist die Hauptgruppe?',
    categoryId: 'other',
    keywords: ['hauptgruppe', 'leitungsgruppe', 'vorstand', 'dirigenten gruppe'],
    body: `Jede Instanz hat eine [[Hauptgruppe]] — eine besondere [[Gruppe]] für Personen mit Leitungsfunktion (z. B. Dirigenten, Chorleiter, Vorstand), die bereits bei der Ersteinrichtung angelegt wird.

Besonderheiten:
- Sie kann nicht gelöscht werden.
- Mitglieder dieser Gruppe erhalten automatisch die [[Rolle]] [[Verantwortlicher]] mit erweiterten Rechten.
- Sie taucht nicht in den Instrumentenlisten für [[Werk|Werke]] oder Notenteile auf, da sie keine eigene Stimme repräsentiert.

Weitere Gruppen (z. B. Sopran, Geigen) legst du zusätzlich unter "Instrumente/Gruppen" an.`,
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
    keywords: ['organisation verknüpfen', 'werke teilen', 'personen zusatzfelder', 'gemeinsame personendaten'],
    body: `Hier verknüpfst du deine Instanz mit einer [[Organisation]] und legst z. B. fest, aus welcher Instanz die gemeinsame Werke-Bibliothek stammt.

Unter "Personen-Zusatzfelder" können [[Administrator|Administratoren]] Felder anlegen, die in allen Instanzen der Organisation zur Verfügung stehen. Die Werte werden organisationsweit pro Person gespeichert. Attendix erkennt dieselbe Person entweder über ihr gemeinsames Attendix-Konto oder über die Funktion "Personen verknüpfen". Wird ein Wert in einer Instanz geändert, erscheint er daher auch in allen anderen Instanzen, denen dieselbe Person zugeordnet ist.

Instanzspezifische [[Zusatzfeld|Zusatzfelder]] bleiben daneben bestehen und gelten weiterhin nur in der jeweiligen Instanz. Personen ohne Konto und ohne organisationsweite Verknüpfung können keinen gemeinsamen Wert zwischen Instanzen erhalten.`,
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
  {
    id: 'other-team-organization',
    title: 'Teamorganisation',
    categoryId: 'other',
    keywords: ['protokoll', 'aufgaben', 'tagesordnung', 'tagesordnungspunkt', 'tasks', 'agenda', 'teamorganisation', 'besprechung'],
    body: `Die [[Teamorganisation]] bündelt drei Werkzeuge für die Arbeit im Leitungsteam:\n\n**Protokolle** – Wird bei einem Termintyp das Protokoll aktiviert (Einstellungen → Termintypen → "Teamorganisation aktivieren"), erscheint beim Öffnen des Termins ein Protokoll-Bereich mit einem Abschnitt pro Ablaufplan-Feld. Inhalte werden automatisch gespeichert. Im Protokoll lassen sich [[Tagesordnungspunkt|Tagesordnungspunkte]] verknüpfen und [[Aufgabe|Aufgaben]] direkt anlegen.\n\n**Aufgaben** – Eigenständige Aktionspunkte mit Titel, Status (Offen / In Bearbeitung / Erledigt), Priorität, Fälligkeitsdatum und Verantwortlichem. Aufgaben können aus einem Protokoll heraus erstellt oder unter Einstellungen → Teamorganisation → Aufgaben verwaltet werden. Die verantwortliche Person erhält automatisch eine Erinnerung 2 Tage vor Fälligkeit.\n\n**Tagesordnung** – Wiederkehrende oder geplante Gesprächspunkte, die terminübergreifend verfolgt werden. Sie können einem oder mehreren Terminen zugeordnet und im Protokoll als erledigt markiert werden.\n\nDie Übersichtsseite unter Einstellungen → Teamorganisation zeigt die offensten Aufgaben, Tagesordnungspunkte und zuletzt bearbeiteten Protokolle.`,
  },
  {
    id: 'other-files',
    title: 'Dateiablage',
    categoryId: 'other',
    keywords: ['dateien', 'ordner', 'upload', 'hochladen', 'aufnahmen', 'dokumente', 'direktlink', 'link teilen', 'files'],
    body: `In der Dateiablage legt deine Instanz gemeinsame Dateien in Ordnern ab, z. B. Aufnahmen, Dokumente oder Bilder. Du findest sie unter Einstellungen → Dateiablage. Die Funktion ist nicht in jeder Instanz freigeschaltet; [[Bewerber]] haben keinen Zugriff.

- **Hochladen und Ordner anlegen** dürfen [[Administrator|Administratoren]] und [[Verantwortlicher|Verantwortliche]]. Beides findest du im Menü (drei Punkte oben rechts).
- **Sortieren** nach Name, Änderungsdatum oder Dateigröße, auf- oder absteigend, ebenfalls über das Menü.
- **Link teilen:** Über "Link zu diesem Ordner teilen" bzw. das Teilen einer Datei erhältst du einen Direktlink. Wer ihn öffnet, landet nach der Anmeldung direkt in der App bei diesem Ordner bzw. dieser Datei.
- **Ordner am Termin:** Bei einem Termin kann unter "Ordner in der Dateiablage" ein Ordner hinterlegt werden (z. B. die Aufnahmen dieses Termins). Mitglieder springen dann von ihrer Anmeldeseite und der Übersicht direkt in diesen Ordner.

Audiodateien spielst du direkt im integrierten Audio-Player ab (siehe "Audio-Player").`,
  },
  {
    id: 'other-audio-player',
    title: 'Audio-Player',
    categoryId: 'other',
    keywords: ['audio', 'abspielen', 'aufnahme anhören', 'mp3', 'sperrbildschirm', 'hintergrund', 'weiterspielen', 'playlist', 'musik hören'],
    body: `Tippst du in der Dateiablage auf eine Audiodatei, öffnet sich der Audio-Player am unteren Bildschirmrand.

- Mit **Vor/Zurück** wechselst du zur nächsten bzw. vorherigen Audiodatei im selben Ordner. Ist ein Titel zu Ende, startet automatisch der nächste.
- In der App läuft die Wiedergabe **im Hintergrund** weiter, auch wenn du die App verlässt oder den Bildschirm sperrst.
- Auf dem **Sperrbildschirm**, im Kontrollzentrum (iOS) bzw. in der Benachrichtigung (Android) siehst du den aktuellen Titel und kannst Wiedergabe/Pause, Vor/Zurück und Spulen steuern.

Die Hintergrundwiedergabe und Sperrbildschirm-Steuerung benötigen eine aktuelle Version der App. Im Browser hängt sie davon ab, was Browser und Gerät unterstützen.`,
  },
  {
    id: 'other-print',
    title: 'Noten und Dateien drucken',
    categoryId: 'other',
    keywords: ['drucken', 'ausdrucken', 'drucker', 'airprint', 'noten drucken', 'pdf drucken', 'notenmappe'],
    body: `An mehreren Stellen gibt es ein Drucker-Symbol, z. B. bei einem [[Werk]] (Menü der Dateien), bei den aktuellen Werken, im Gruppenverzeichnis und in "Meine Anwesenheit" bei den aktuellen Werken. Alle Druckknöpfe funktionieren gleich:

- **In der App (iOS/Android):** Es öffnet sich der Druckdialog des Geräts, in dem du Drucker und Seiten auswählst.
- **Im Browser am Computer:** Es öffnet sich direkt der Druckdialog des Browsers, ohne neues Fenster oder Popup.
- **Im Browser auf dem Handy:** Es öffnet sich das Teilen-Menü. Dort findest du "Drucken" (iOS) oder kannst die PDF speichern bzw. in einer anderen App öffnen.

Werden mehrere Dateien gedruckt, fasst Attendix sie zu einer PDF zusammen.`,
  },
];
