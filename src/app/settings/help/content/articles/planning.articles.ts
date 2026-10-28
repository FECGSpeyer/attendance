import { HelpArticle } from '../types';

export const PLANNING_ARTICLES: HelpArticle[] = [
  {
    id: 'plan-create',
    title: 'Ablaufplan erstellen',
    categoryId: 'planning',
    keywords: ['plan anlegen', 'programm erstellen', 'ablauf', 'feld hinzufügen', 'programmpunkt', 'info-text', 'infotext', 'notiz', 'beschreibung'],
    body: `Unter "Planung" wählst du einen Termin aus und erstellst einen [[Ablaufplan]]: eine Abfolge von Programmpunkten (Werke, Ansprachen, Pausen) mit jeweiliger Dauer und Startzeit. Die Endzeit wird automatisch anhand der Dauer aller Punkte berechnet.

**Punkt hinzufügen:** Tippe beim Ablauf auf **+** und dann auf **Feld hinzufügen**. Neben Name, Ausführung und Dauer kannst du gleich einen optionalen **Info-Text** eingeben, zum Beispiel einen Liedtitel oder einen Hinweis. Der Info-Text erscheint klein unter dem Programmpunkt. Später änderst du ihn, indem du auf den Punkt tippst.

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
    id: 'plan-blocks',
    title: 'Programmblöcke mit Unterpunkten',
    categoryId: 'planning',
    keywords: ['programmblock', 'block', 'unterpunkt', 'unterpunkte', 'gruppe', 'programm', 'verschachtelt', 'einrücken', 'jugendchor', 'kinderprogramm', 'blockvorlage', 'ad-hoc', 'planungstool', 'öffentlich'],
    body: `Manche Programmpunkte bestehen aus mehreren Teilen, zum Beispiel "Programm Jugendchor" mit Liedern und einem Gedicht. Dafür gibt es **Programmblöcke**.

**Block anlegen:** Tippe im Ablaufplan-Editor beim Ablauf auf **+** und dann auf **Programmblock hinzufügen**. Gib einen Namen und optional eine Ausführung ein. Danach legst du gleich den ersten Unterpunkt an. Weitere Unterpunkte fügst du über **Unterpunkt hinzufügen** am Ende des Blocks hinzu.

**Zeiten:** Die Dauer des Blocks ergibt sich automatisch aus seinen Unterpunkten. Der erste Unterpunkt beginnt mit dem Block, danach geht der Ablauf ganz normal weiter.

**Sortieren:** Ziehst du den Block am Griff, wandern alle Unterpunkte mit. Einen normalen Programmpunkt ziehst du zwischen zwei Unterpunkte, damit er zum Block gehört. Ziehst du einen Unterpunkt aus dem Block heraus, wird er wieder ein normaler Punkt. Alternativ wischst du einen Punkt nach links und tippst auf **Einrücken** oder **Ausrücken**. Mit dem Pfeil links klappst du einen Block ein oder aus.

**Block bearbeiten:** Tippe auf den Blocknamen. Dort kannst du den Block bearbeiten, ihn **auflösen** (die Unterpunkte bleiben als normale Punkte erhalten) oder komplett löschen.

**Blockvorlagen:** Admins können einen Block über **Als Vorlage speichern** sichern. Gespeicherte Blöcke erscheinen im **+**-Menü unter "Programmblöcke" und werden mit einem Tippen an das Ende des Ablaufs angehängt. Über das Papierkorb-Symbol daneben löschen Admins eine Vorlage wieder.

**Ad-hoc-Ablaufplanung und öffentliches Planungstool:** Auch in der Ad-hoc-Ablaufplanung (Einstellungen › Ad-Hoc Ablaufplanung) und im öffentlichen Planungstool unter attendix.de/planung findest du im **+**-Menü **Programmblock hinzufügen**. Anlegen, Sortieren, Ein- und Ausrücken funktionieren wie im Ablaufplan-Editor. Bist du angemeldet, kannst du dort auch die Blockvorlagen deiner Gruppe einfügen. Über einen Bearbeiten-Link sortierst du Blöcke ebenfalls samt Unterpunkten um.

**Was Mitglieder sehen:** Auf der Terminseite, in der Planansicht, auf der Dashboard-Karte und im PDF erscheinen die Unterpunkte eingerückt unter ihrem Block. Im Live-Modus ist der laufende Unterpunkt markiert, und der Block bleibt hervorgehoben, solange einer seiner Unterpunkte läuft.`,
  },
  {
    id: 'plan-live-activity',
    title: 'Laufender Ablaufplan auf dem Sperrbildschirm',
    categoryId: 'planning',
    keywords: ['live activity', 'dynamic island', 'sperrbildschirm', 'lockscreen', 'live update', 'countdown', 'restzeit', 'aktueller punkt', 'benachrichtigung', 'iphone', 'android'],
    body: `Läuft gerade ein [[Ablaufplan]], zeigt die Attendix-App den aktuellen Programmpunkt groß mit Restzeit, darunter einen Balken für den ganzen Ablauf und den nächsten Punkt mit Uhrzeit auf deinem Sperrbildschirm. Lange Titel dürfen zwei Zeilen haben. Auf dem iPhone erscheint er außerdem in der Dynamic Island, auf Android als laufende Benachrichtigung mit Countdown.

**Wann:** Die Anzeige startet automatisch 15 Minuten vor dem ersten Punkt. Bis zum Beginn zeigt sie einen Countdown bis zum Start und die ersten Programmpunkte mit Uhrzeit. Danach springt sie von selbst zum nächsten Punkt und verschwindet 15 Minuten nach dem Ende. Wird der Plan während des Termins geändert, ist die Anzeige spätestens nach einer Minute aktuell. Der Plan läuft nach Uhrzeit: Ist die Zeit eines Punkts um, bleibt die Restzeit kurz bei 0:00, bis der nächste Punkt erscheint. Auf dem iPhone springt die Anzeige spätestens eine Minute später auch ohne Netz von selbst zum nächsten Punkt.

**Wer:** Alle, die den Ablaufplan sehen dürfen: Admins und Verantwortliche immer, alle anderen, wenn der Plan für Mitglieder freigegeben ist. Beobachter sehen den Ablaufplan nie, also auch keine Anzeige. Wer sich vom Termin abgemeldet hat, bekommt ebenfalls keine.

**Mehrere Pläne:** Bei Terminen mit mehreren Plänen (z. B. pro Tag einer Freizeit) erscheint jeweils der Plan, der gerade läuft.

**Antippen** öffnet den Ablaufplan in der App im Live-Modus.

**Abschalten:** Unter Einstellungen → Benachrichtigungen → **Laufender Ablaufplan**. Auf dem iPhone braucht der automatische Start iOS 17.2 oder neuer; bei älteren Versionen erscheint die Anzeige, sobald du die App während des Termins öffnest. Die Funktion gibt es nur in der App aus dem App Store bzw. Play Store, nicht im Browser.`,
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
    keywords: ['pdf export', 'teilen', 'link', 'telegram', 'ad-hoc', 'bild'],
    body: `Ein fertiger [[Ablaufplan]] kann als PDF exportiert, per Telegram verschickt oder über einen öffentlichen Link geteilt werden. Beim Teilen per Link lässt sich festlegen, ob Betrachter den Plan nur ansehen oder auch live mitverfolgen können, während er während der Veranstaltung aktualisiert wird.

Hat ein Termin mehrere Ablaufpläne, kannst du beim Teilen wählen, ob nur der gezeigte Plan oder alle Pläne in einer PDF landen (siehe "Mehrere Ablaufpläne für einen Termin").

Auch in der Ad-hoc-Ablaufplanung (Einstellungen › Ad-Hoc Ablaufplanung) kannst du den Plan per Telegram verschicken, als PDF, als PDF 2x A5 oder als Bild. Die Optionen erscheinen beim Exportieren und Teilen, sobald du angemeldet bist und Telegram in deinen Benachrichtigungen verbunden hast.`,
  },
];
