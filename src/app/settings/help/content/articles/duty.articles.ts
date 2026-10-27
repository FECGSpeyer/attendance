import { HelpArticle } from '../types';

export const DUTY_ARTICLES: HelpArticle[] = [
  {
    id: 'duty-setup',
    title: 'Dienstplan einrichten',
    categoryId: 'duty',
    keywords: ['dienstplan', 'dienst', 'dienste', 'dienst-modus', 'dienstplan-ansicht', 'meine dienste', 'ansicht', 'tontechnik', 'technik', 'ton', 'beamer', 'ordner', 'küchendienst', 'besetzung', 'einteilen', 'schichtplan', 'termintyp', 'benötigte personen'],
    body: `Mit dem [[Dienst-Modus]] wird aus einem Termintyp ein Dienstplan, z. B. für die Tontechnik. Nicht alle kommen, sondern nur so viele Personen, wie gebraucht werden.

So schaltest du ihn ein (als [[Administrator]] oder [[Verantwortlicher]]):

1. Öffne **Mehr → Einstellungen → Anwesenheits-Typen** und tippe auf den Typ, z. B. „Tontechnik“. Lege dafür gern einen eigenen Termintyp an.
2. Lege unter **Relevante Gruppen** oder über ein Zusatzfeld fest, wer zum Dienst-Team gehört. Am einfachsten ist ein Ja/Nein-Zusatzfeld „Tontechnik“, weil jede Person nur eine Hauptgruppe hat.
3. Schalte unter **Dienstplan** den **Dienst-Modus** ein.
4. Stelle ein, wie viele Personen normalerweise **benötigt** werden, ob man sich **selbst eintragen** darf, nach wie vielen Tagen an **unbestätigte Dienste erinnert** wird, ob die **Gruppe bei einem Ausfall** benachrichtigt wird und ab wann eine **dringende** Nachricht rausgeht.

**Termine anlegen:** Beim Anlegen mehrerer Termine stellst du pro Wochentag ein, wie viele Personen gebraucht werden, z. B. mittwochs und freitags 1, sonntags 2. Auf jedem Termin kannst du die Zahl später mit + und − ändern.

**Dienstplan-Ansicht:** Sind Dienste bei euch der Normalfall, kann „Meine Termine“ ganz auf den Dienstplan ausgerichtet werden. Beim ersten Termintyp im Dienst-Modus fragt die App danach; später schaltest du es unter **Mehr → Einstellungen** im Bereich „Anwesenheiten“ mit **„Dienstplan-Ansicht für Meine Termine“** um. Der Schalter erscheint nur, wenn es mindestens einen Termintyp im Dienst-Modus gibt. Personen im Dienst-Team sehen dann oben ihre Zahlen (Dienste diesen Monat, zu bestätigen, offen im Team) statt der Anwesenheitsquote, danach „Bitte bestätigen“, den nächsten Dienst mit Team, die offenen Dienste direkt auf der Seite und ihre weiteren Dienste. Andere Termine stehen eingeklappt unter „Weitere Termine“. Wer in keinem Dienst-Team ist, sieht die normale Ansicht.

**Was sich ändert:** Alle im Dienst-Team stehen im Termin, sind aber erst einmal nur [[Springer]]. Nur wer eingeteilt ist, sieht den Dienst unter „Meine Termine“ und zählt für die Anwesenheitsquote. In der Terminliste zeigt ein Abzeichen wie „1/2“, wie voll ein Dienst ist: grün = besetzt und bestätigt, gelb = teilweise oder noch unbestätigt, rot = niemand eingeteilt.`,
  },
  {
    id: 'duty-assign',
    title: 'Personen einteilen und Dienste bestätigen',
    categoryId: 'duty',
    keywords: ['einteilen', 'zuteilen', 'bestätigen', 'zusagen', 'kann nicht', 'absagen', 'angefragt', 'bestätigt', 'push', 'erinnerung', 'unbestätigt', 'austragen', 'besetzung', 'dienst', 'admin', 'leitung', 'keine push', 'benachrichtigung'],
    body: `**Einteilen (Leitung):** Öffne den Termin. Im Bereich **Besetzung** siehst du, wer eingeteilt ist und wer noch verfügbar ist. Tippe auf **„Person einteilen“** oder bei einer Person auf **„Einteilen“**. Die Liste ist nach Anzahl Dienste im Monat sortiert, damit du fair verteilst. Wer abgesagt hat oder [[Regelmäßig verhindert|regelmäßig verhindert]] ist, steht unter „Kann nicht“.

Eingeteilte bekommen sofort eine Push-Nachricht und sind erst einmal **angefragt**. Über das × neben dem Namen trägst du jemanden wieder aus.

**Einteilung und Anwesenheit hängen zusammen:** Markierst du in der Anwesenheitsliste jemanden als anwesend oder verspätet, ist die Person automatisch eingeteilt und bestätigt. Setzt du einen bestätigten Dienst zurück auf neutral, ist er wieder angefragt. Eine Abmeldung lässt die Einteilung stehen und zählt als „kann nicht“.

**Bestätigen (Mitglieder):** Unter **Meine Termine** erscheint oben „Bitte bestätigen“. Tippe auf **„Bestätigen“**, dann steht dein Dienst auf **bestätigt**. Mit **„Kann nicht“** sagst du ab wie bei einem normalen Termin, mit Grund. Du kannst auch einfach wie gewohnt zusagen; das zählt ebenfalls als Bestätigung.

**Bestätigen (Admins und Verantwortliche):** Bist du selbst eingeteilt, siehst du unter **Termine** oben **„Deine Dienste: bitte bestätigen“** mit **„Bestätigen“** und **„Kann nicht“**. Dieselben Knöpfe findest du auch im Termin unter **Besetzung** bei deinem Namen. Eine Push-Nachricht zu deinem Dienst öffnet direkt den Termin.

Hast du nach der eingestellten Zahl an Tagen nicht geantwortet, bekommst du einmal eine Erinnerung. Sagst du einen bestätigten Dienst später ab, ist das eine normale Abmeldung mit Grund; die Leitung wird wie gewohnt informiert.

**Keine Push-Nachricht bekommen?** Unter **Benachrichtigungen** müssen **„Benachrichtigungen aktivieren“** und **„Push-Benachrichtigungen“** eingeschaltet sein, und die App muss auf dem Handy Mitteilungen senden dürfen.

Möchtest du keine Dienst-Nachrichten, schalte unter **Benachrichtigungen** den Schalter **„Dienste“** aus. Dringende Anfragen bekommst du trotzdem.`,
  },
  {
    id: 'duty-open',
    title: 'Offene Dienste übernehmen und einspringen',
    categoryId: 'duty',
    keywords: ['offene dienste', 'übernehmen', 'einspringen', 'selbst eintragen', 'springer', 'vertretung', 'unterbesetzt', 'ausfall', 'dringend', 'wer kann', 'wieder besetzt'],
    body: `**Offene Dienste:** Gehörst du zu einem Dienst-Team, siehst du unter **Meine Termine** die Kachel **„Offene Dienste“** (in der Dienstplan-Ansicht stehen sie direkt auf der Seite, dringende oben). Dort stehen alle Dienste, bei denen noch jemand fehlt. Mit **„Ich übernehme“** (in der Dienstplan-Ansicht **„Übernehmen“**) trägst du dich ein, sofern die Leitung das Selbst-Eintragen erlaubt hat. Tippen zwei Personen gleichzeitig, bekommt die erste den Platz; die andere sieht einen Hinweis.

**Wenn jemand ausfällt:** Sagt eine eingeteilte Person ab und der Dienst ist dadurch unterbesetzt, bekommen alle [[Springer]] eine Nachricht „Kannst du einspringen?“. Ein Tipp darauf öffnet die offenen Dienste.

**Dringend:** Ist ein Dienst kurz vorher (je nach Einstellung z. B. 24 Stunden) noch nicht voll, geht einmalig eine dringende Nachricht an alle Springer und an die Leitung. Auf dem iPhone kommt sie auch im Fokus-Modus durch.

**Wieder besetzt:** Sobald jemand einspringt und der Dienst voll ist, bekommen die anderen eine Entwarnung, damit niemand umsonst kommt.`,
  },
  {
    id: 'duty-unavailable',
    title: 'Regelmäßig verhindert eintragen',
    categoryId: 'duty',
    keywords: ['regelmäßig verhindert', 'verfügbarkeit', 'wochentag', 'immer', 'jeden mittwoch', 'kinderstunde', 'nicht verfügbar', 'dauerhaft', 'abwesenheit', 'wiederkehrend', 'regel'],
    body: `Kannst du an bestimmten Wochentagen grundsätzlich nicht, z. B. mittwochs wegen der Kinderstunde, trag das einmal als Regel ein, statt jeden Termin einzeln abzusagen.

**Wo:** Unter **Meine Termine → Offene Dienste → Regelmäßig verhindert**, in der Dienstplan-Ansicht direkt unten auf der Seite. Die Leitung findet dasselbe bei einer Person unter **Abwesenheiten → Regelmäßig verhindert**.

**So geht's:** Tippe auf **„Regel hinzufügen“**, wähle die Wochentage, die Termintypen (ohne Auswahl gilt die Regel für alle), optional einen Grund und ein Enddatum, und speichere.

**Was passiert:** Neue Termine an diesen Tagen werden für dich automatisch als entschuldigt eingetragen, mit dem Vermerk „Regelmäßig verhindert“. Bei Diensten wirst du dann nicht eingeteilt und beim automatischen Verteilen übersprungen. Gibt es schon geplante Termine, die passen, fragt die App, ob sie dort ebenfalls angepasst werden sollen. Termine, bei denen du schon selbst geantwortet hast oder eingeteilt bist, bleiben unverändert.

Löschst du eine Regel, bleiben bereits eingetragene Abmeldungen bestehen.`,
  },
  {
    id: 'duty-distribute',
    title: 'Dienste automatisch fair verteilen',
    categoryId: 'duty',
    keywords: ['verteilen', 'automatisch', 'fair', 'gerecht', 'zufall', 'dienstplan erstellen', 'monat planen', 'vorschlag', 'tauschen', 'maximal'],
    body: `Statt jeden Dienst einzeln zu besetzen, kann die App einen Vorschlag für einen ganzen Zeitraum machen. Das dürfen [[Administrator|Administratoren]] und [[Verantwortlicher|Verantwortliche]].

1. Tippe unter **Termine** oben auf das Symbol **Dienste verteilen** (zwei gekreuzte Pfeile).
2. Wähle den **Zeitraum** (vorbelegt ist der nächste Monat), die Termintypen und die Regeln: **höchstens wie viele Dienste pro Person** und **nicht zweimal am selben Tag**.
3. Tippe auf **„Vorschlag berechnen“**.

Wer bisher am wenigsten Dienste hat, kommt zuerst dran; bei Gleichstand entscheidet der Zufall. Wer abgesagt hat oder regelmäßig verhindert ist, wird nicht eingeteilt. Bestehende Einteilungen bleiben, es werden nur offene Plätze gefüllt.

**Vorschlag anpassen:** Tippe auf einen Namen, um ihn zu tauschen oder den Platz offen zu lassen, oder auf „offen“, um selbst jemanden zu wählen. Mit dem Symbol oben rechts würfelst du neu. Unten siehst du, wie viele Dienste jede Person im Zeitraum hätte.

**Speichern:** Alle neu Eingeteilten bekommen eine Push-Nachricht und bestätigen wie gewohnt.`,
  },
  {
    id: 'calendar-subscription',
    title: 'Termine im Kalender abonnieren',
    categoryId: 'settings',
    keywords: ['kalender', 'abo', 'abonnieren', 'ical', 'ics', 'google kalender', 'apple kalender', 'outlook', 'synchronisieren', 'abgesagte ausblenden', 'dienste im kalender'],
    body: `Unter **Mehr → Auswertung & Daten → Kalender abonnieren** bekommst du einen Link, den du in deine Kalender-App (Apple, Google, Outlook) einträgst. Neue und geänderte Termine erscheinen dann automatisch.

Als Mitglied bekommst du deinen persönlichen Kalender, Administratoren alle Termine der Instanz. Im persönlichen Kalender steht hinter jedem Termin dein Status, z. B. „Zugesagt“ oder „Entschuldigt“. Setzt du beim Kopieren den Haken **„Abgesagte Termine ausblenden“**, fehlen Termine, bei denen du abgesagt hast, ganz.

**Dienste:** Von Terminen im [[Dienst-Modus]] stehen nur die drin, für die du eingeteilt bist oder dich selbst eingetragen hast. Noch nicht bestätigte Dienste tragen den Zusatz „bitte bestätigen“. Sagst du einen Dienst ab, verschwindet er aus dem Kalender.`,
  },
];
