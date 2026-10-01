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
    body: `Unter **Einstellungen → Organisation → Planvorlagen & Felder** können auf Organisationsebene zwei Arten von Planungshilfen definiert werden:

**Standardfelder** sind wiederverwendbare Einzelfelder (z. B. "Begrüßung 5 min") mit Name, Ausführendem und Dauer. Sie erscheinen im Planungs-Menü unter dem Abschnitt "Felder" und können mit einem Tippen dem aktuellen Ablauf hinzugefügt werden.

**Vorlagen** sind vollständige Ablaufpläne mit einem Namen, optionaler Startzeit und einer beliebigen Anzahl von Feldern (inkl. Werk-Platzhaltern). Im Planungs-Menü erscheinen sie oben unter "Vorlagen" — ein Tippen ersetzt den aktuellen Ablauf vollständig durch die Vorlage.

Sowohl Vorlagen als auch Standardfelder stehen allen Instanzen der Organisation zur Verfügung.`,
  },
  {
    id: 'plan-share',
    title: 'Ablaufplan exportieren und teilen',
    categoryId: 'planning',
    keywords: ['pdf export', 'teilen', 'link', 'telegram'],
    body: `Ein fertiger [[Ablaufplan]] kann als PDF exportiert, per Telegram verschickt oder über einen öffentlichen Link geteilt werden. Beim Teilen per Link lässt sich festlegen, ob Betrachter den Plan nur ansehen oder auch live mitverfolgen können, während er während der Veranstaltung aktualisiert wird.`,
  },
];
