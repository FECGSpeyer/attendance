import { HelpArticle } from '../types';

export const PLANNING_ARTICLES: HelpArticle[] = [
  {
    id: 'plan-create',
    title: 'Ablaufplan erstellen',
    categoryId: 'planning',
    keywords: ['plan anlegen', 'programm erstellen', 'ablauf'],
    body: `Unter "Planung" wählst du einen Termin aus und erstellst einen [[Ablaufplan]]: eine Abfolge von Programmpunkten (Werke, Ansprachen, Pausen) mit jeweiliger Dauer und Startzeit. Die Endzeit wird automatisch anhand der Dauer aller Punkte berechnet.

Über "Zurücksetzen" kannst du jederzeit zu den hinterlegten Standard-Programmpunkten des Termin-Typs zurückkehren — bereits vorgenommene Änderungen gehen dabei verloren.`,
  },
  {
    id: 'plan-multiple',
    title: 'Mehrere Ablaufpläne für einen Termin',
    categoryId: 'planning',
    keywords: ['mehrere pläne', 'weiterer plan', 'mehrtägig', 'freizeit', 'wochenende', 'tag', 'tagesplan', 'pro tag', 'zweiter ablaufplan'],
    body: `Ein Termin kann mehr als einen [[Ablaufplan]] haben, zum Beispiel einen für jeden Tag einer Freizeit oder Probe und Konzert am selben Tag.

**Plan anlegen:** Öffne den Ablaufplan im Editor, tippe beim Ablauf auf **+** und ganz unten auf **Weiteren Ablaufplan anlegen**. Du entscheidest dann, ob der neue Plan den aktuellen Ablauf als **Kopie** übernimmt oder **leer** startet. Themen der Tagesordnung (TOPs) bleiben dabei immer im ersten Plan.

**Namen:** Bei mehrtägigen Terminen heißen die Pläne automatisch nach ihrem Tag (z. B. "Sa 18.10."), sonst "Plan 1", "Plan 2" usw.

**Umschalten und verwalten:** Sobald es mehr als einen Plan gibt, erscheint über dem Ablauf eine Leiste mit kleinen Chips. Über **⋯** daneben kannst du den gewählten Plan umbenennen, einem anderen Tag zuordnen, verschieben oder löschen. Bleibt nur ein Plan übrig, verschwindet die Leiste wieder.

**Was Mitglieder sehen:** Auf der Terminseite, in der Ansicht für Mitglieder und Eltern und über den Teilen-Link erscheinen dieselben Chips. Ausgewählt ist automatisch der Plan von heute, sonst der erste. Die Dashboard-Karte "Aktueller Plan" zeigt ebenfalls den Plan des heutigen Tages.

**Teilen und PDF:** Beim Teilen wählst du oben, ob nur der gerade gezeigte Plan oder alle Pläne exportiert werden. "Alle" ergibt eine PDF mit einer Seite pro Plan.`,
  },
  {
    id: 'plan-conductor',
    title: 'Leitung/Dirigent zuordnen',
    categoryId: 'planning',
    keywords: ['dirigent auswählen', 'chorleiter', 'leitung'],
    body: `Jedem Programmpunkt im [[Ablaufplan]] kann eine Leitung (Dirigent/Chorleiter) zugewiesen werden. Attendix schlägt dabei Personen aus der [[Historie]] des jeweiligen [[Werk|Werks]] vor.`,
  },
  {
    id: 'plan-templates',
    title: 'Planvorlagen & Standardfelder',
    categoryId: 'planning',
    keywords: ['vorlage', 'template', 'standardfeld', 'organisation', 'wiederverwendbar'],
    body: `Unter **Einstellungen → Organisation → Planvorlagen & Felder** (oder **Einstellungen → Planung → Planvorlagen & Felder**) können auf Organisationsebene zwei Arten von Planungshilfen definiert werden:

**Standardfelder** sind wiederverwendbare Einzelfelder (z. B. "Begrüßung 5 min") mit Name, Ausführendem und Dauer. Sie erscheinen im Planungs-Menü und in der Ad-hoc-Ablaufplanung unter dem Abschnitt "Felder" und können mit einem Tippen dem aktuellen Ablauf hinzugefügt werden.

**Vorlagen** sind vollständige Ablaufpläne mit einem Namen, optionaler Startzeit und einer beliebigen Anzahl von Feldern (inkl. Werk-Platzhaltern). Im Planungs-Menü erscheinen sie unter "Vorlagen" — ein Tippen ersetzt den aktuellen Ablauf vollständig. In der Ad-hoc-Ablaufplanung erscheinen sie im Vorlage-Auswahlfeld als "(Org)"-Einträge.

Sowohl Vorlagen als auch Standardfelder stehen allen Instanzen der Organisation zur Verfügung.`,
  },
  {
    id: 'plan-share',
    title: 'Ablaufplan exportieren und teilen',
    categoryId: 'planning',
    keywords: ['pdf export', 'teilen', 'link', 'telegram'],
    body: `Ein fertiger [[Ablaufplan]] kann als PDF exportiert, per Telegram verschickt oder über einen öffentlichen Link geteilt werden. Beim Teilen per Link lässt sich festlegen, ob Betrachter den Plan nur ansehen oder auch live mitverfolgen können, während er während der Veranstaltung aktualisiert wird.

Hat ein Termin mehrere Ablaufpläne, kannst du beim Teilen wählen, ob nur der gezeigte Plan oder alle Pläne in einer PDF landen (siehe "Mehrere Ablaufpläne für einen Termin").`,
  },
];
