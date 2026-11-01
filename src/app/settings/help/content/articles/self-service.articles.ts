import { HelpArticle } from '../types';

export const SELF_SERVICE_ARTICLES: HelpArticle[] = [
  {
    id: 'self-signout',
    title: 'Mich selbst an- oder abmelden',
    categoryId: 'self-service',
    keywords: ['abmelden', 'anmelden', 'meine termine', 'signout', 'anmeldefelder', 'notiz', 'antworten ändern', 'anmeldung bearbeiten', 'zusagen', 'verspätung', 'absagen', 'heute', 'nächster termin', 'weitere optionen', 'vergangene termine', 'anwesenheitsquote', 'nicht eingeladen', 'alle termine sichtbar', 'fremde termine'],
    body: `Unter "Meine Anwesenheit" siehst du oben deine Begrüßung mit deiner Anwesenheitsquote und wie oft du zu spät warst. Darunter liegen die Kacheln „Aktuelle Werke“ und „Abwesenheit melden“, sofern sie für dich freigeschaltet sind.

Der Termin von heute (oder der nächste Termin) steht in einer eigenen Karte. Dort meldest du dich direkt mit „Zusagen“, „Verspätung“ oder „Absagen“ an oder ab. Die kleinen Markierungen wie „Werke“, „Ablaufplan“, „Infos“, „Anhang“, „Dateien“ oder „Route“ kannst du direkt antippen, um den Plan, die Beschreibung, den Anhang, die Dateiablage oder die Navigation zu öffnen. Alles Weitere, z. B. Anmelden mit Notiz oder Anmeldefelder, findest du über den Link „Weitere Optionen“. Dort steht nur, was nicht schon als Button oder Markierung auf der Karte zu sehen ist. Ein Tipp auf die Karte selbst öffnet kein Menü.

Die anstehenden Termine sind nach Monaten gruppiert. Jeder Termin zeigt links das Datum, darunter Uhrzeit und Ort und rechts deinen [[Anwesenheitsstatus]]. Hinweise wie Anmeldefrist, Notiz, Ablaufplan oder Infos erscheinen als kleine Markierungen. Tippe einen Termin an, um deinen Status zu ändern. Meldest du dich ab, wählst du optional einen [[Ausfallgrund]] aus.

Hat deine Instanz „Alle Termine für Mitglieder sichtbar“ eingeschaltet, siehst du auch Termine, zu denen du nicht eingeladen bist. Sie sind grau hinterlegt, das Datum ist gestrichelt umrandet und rechts steht statt deines Status „Nicht eingeladen“. Das gilt für die Karte des aktuellen Termins und für die anstehenden Termine. Unter „Vergangen“ stehen nur Termine, bei denen du dabei warst.

Unter „Vergangen“ siehst du deine Quote, farbige Punkte für deine letzten Termine und die letzten drei Termine. Mit „Alle anzeigen“ klappst du die ganze Liste auf.

Hat ein Termin Anmeldefelder (z. B. „Essen mit?“), fragt die App sie beim Anmelden ab – auch wenn du „Anmelden mit Notiz“ wählst: Erst gibst du deine Notiz ein, danach füllst du die Anmeldefelder aus.

Bist du schon angemeldet, tippst du den Termin an und wählst „Anmeldefelder anpassen“, um deine Antworten nachträglich zu ändern. Das geht, solange die Anmeldefrist des Termins nicht abgelaufen ist.`,
  },
  {
    id: 'self-event-songs',
    title: 'Werke eines Termins ansehen',
    categoryId: 'self-service',
    keywords: ['werke', 'lieder', 'stücke', 'noten', 'termin werke', 'aktuelle werke', 'ablaufplan', 'was singen wir', 'was spielen wir', 'noten drucken', 'noten herunterladen', 'vergangene termine'],
    body: `Hängen an einem Termin [[Werk|Werke]], steht unter "Meine Anwesenheit" am Termin die Markierung „♪ 3 Werke“. Das gilt für den nächsten Termin, die anstehenden und auch die vergangenen Termine. So siehst du z. B. auch, was am letzten Sonntag gesungen wurde.

Tippe die Markierung an, um die Werke des Termins zu sehen. Die Werke stehen in der Reihenfolge des [[Ablaufplan|Ablaufplans]], danach folgen Werke, die nur beim Termin eingetragen sind. Werke aus dem Ablaufplan siehst du auch dann, wenn der Ablaufplan selbst nicht für dich freigegeben ist. Ist ein Werk rot hinterlegt, sind für deine Stimme bzw. dein Instrument keine Noten hinterlegt.

Tippst du ein Werk an, kannst du wie bei „Aktuelle Werke“ die Noten anzeigen, herunterladen oder drucken, die Aufnahme anhören oder den Liedtext öffnen. Mit dem Drucker-Symbol oben rechts druckst du alle Noten des Termins auf einmal. Ist der Ablaufplan freigegeben, öffnest du ihn unten mit „Ablaufplan öffnen“. Auch im Ablaufplan selbst kannst du ein Werk antippen, um seine Noten zu öffnen.

Die Kachel „Aktuelle Werke“ zeigt weiterhin alle Werke der kommenden Termine gesammelt, jetzt ebenfalls inklusive der Werke aus dem Ablaufplan. Als [[Elternteil]] siehst du die Werke der Termine deiner Kinder und kannst den hinterlegten Link des Werks öffnen.`,
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
    keywords: ['eltern', 'kind anmelden', 'parent', 'alle kinder', 'kinder abmelden'],
    body: `Als [[Elternteil]] siehst du unter "Meine Anwesenheit" zusätzlich die Termine deiner Kinder und kannst deren [[Anwesenheitsstatus]] genauso pflegen wie deinen eigenen.

Jeder Termin ist eine Karte, in der deine Kinder mit ihrem Status stehen. Tippe auf ein Kind, um nur seinen Status zu ändern, oder auf „Alle“, um alle Kinder auf einmal an- oder abzumelden. Der Termin von heute (oder der nächste) steht oben in einer eigenen Karte. Bei vergangenen Terminen siehst du den Status jedes Kindes direkt in der Zeile.`,
  },
  {
    id: 'self-overview',
    title: 'Alle meine Termine über mehrere Instanzen',
    categoryId: 'self-service',
    keywords: ['übersicht', 'alle termine', 'instanzen', 'chronologisch', 'nach instanz', 'mehrere gruppen', 'gesamtübersicht'],
    body: `Bist du in mehreren Instanzen Mitglied, findest du unter "Übersicht" alle deine Termine aus allen Instanzen an einem Ort. Oben steht deine Anwesenheitsquote über alle Instanzen.

In der Ansicht „Chronologisch“ steht der nächste Termin in einer eigenen Karte. Dort meldest du dich direkt mit „Zusagen“, „Verspätung“ oder „Absagen“ an oder ab, weitere Aktionen findest du unter „Weitere Optionen“. Darunter folgen die anstehenden Termine nach Monaten gruppiert und die vergangenen Termine (die letzten drei, der Rest über „Alle anzeigen“). Ein farbiger Punkt mit Namen zeigt, zu welcher Instanz ein Termin gehört.

In der Ansicht „Nach Instanz“ siehst du die Termine je Instanz. Tippe einen anstehenden Termin an, um deinen [[Anwesenheitsstatus]] zu ändern. Markierungen wie „Infos“, „Anhang“, „Dateien“ oder „Route“ öffnen die Beschreibung, den Anhang, die Dateiablage oder die Navigation direkt.`,
  },
];
