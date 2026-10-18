import { HelpArticle } from '../types';

export const SELF_SERVICE_ARTICLES: HelpArticle[] = [
  {
    id: 'self-signout',
    title: 'Mich selbst an- oder abmelden',
    categoryId: 'self-service',
    keywords: ['abmelden', 'anmelden', 'meine termine', 'signout', 'anmeldefelder', 'notiz', 'antworten ändern', 'anmeldung bearbeiten', 'zusagen', 'verspätung', 'absagen', 'heute', 'nächster termin', 'weitere optionen', 'vergangene termine', 'anwesenheitsquote'],
    body: `Unter "Meine Anwesenheit" siehst du oben deine Begrüßung mit deiner Anwesenheitsquote und wie oft du zu spät warst. Darunter liegen die Kacheln „Aktuelle Werke“ und „Abwesenheit melden“, sofern sie für dich freigeschaltet sind.

Der Termin von heute (oder der nächste Termin) steht in einer eigenen Karte. Dort meldest du dich direkt mit „Zusagen“, „Verspätung“ oder „Absagen“ an oder ab. Die kleinen Markierungen wie „Ablaufplan“, „Infos“, „Anhang“, „Dateien“ oder „Route“ kannst du direkt antippen, um den Plan, die Beschreibung, den Anhang, die Dateiablage oder die Navigation zu öffnen. Alles Weitere, z. B. Anmelden mit Notiz oder Anmeldefelder, findest du über den Link „Weitere Optionen“. Dort steht nur, was nicht schon als Button oder Markierung auf der Karte zu sehen ist. Ein Tipp auf die Karte selbst öffnet kein Menü.

Die anstehenden Termine sind nach Monaten gruppiert. Jeder Termin zeigt links das Datum, darunter Uhrzeit und Ort und rechts deinen [[Anwesenheitsstatus]]. Hinweise wie Anmeldefrist, Notiz, Ablaufplan oder Infos erscheinen als kleine Markierungen. Tippe einen Termin an, um deinen Status zu ändern. Meldest du dich ab, wählst du optional einen [[Ausfallgrund]] aus.

Unter „Vergangen“ siehst du deine Quote, farbige Punkte für deine letzten Termine und die letzten drei Termine. Mit „Alle anzeigen“ klappst du die ganze Liste auf.

Hat ein Termin Anmeldefelder (z. B. „Essen mit?“), fragt die App sie beim Anmelden ab – auch wenn du „Anmelden mit Notiz“ wählst: Erst gibst du deine Notiz ein, danach füllst du die Anmeldefelder aus.

Bist du schon angemeldet, tippst du den Termin an und wählst „Anmeldefelder anpassen“, um deine Antworten nachträglich zu ändern. Das geht, solange die Anmeldefrist des Termins nicht abgelaufen ist.`,
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
