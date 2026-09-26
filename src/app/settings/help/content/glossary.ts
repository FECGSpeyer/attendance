import { GlossaryTerm } from './types';

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: 'instanz',
    term: 'Instanz',
    aliases: ['Tenant', 'Verein', 'Gruppe (Instanz)'],
    definition: 'Der Verein, Chor, das Orchester oder die Gruppe, für die du in Attendix arbeitest. Ein Konto kann mit mehreren Instanzen verbunden sein und du kannst über "Instanz wechseln" in den Einstellungen zwischen ihnen umschalten. Alle Daten (Personen, Termine, Werke, ...) sind pro Instanz getrennt.',
  },
  {
    id: 'rolle',
    term: 'Rolle',
    definition: 'Bestimmt, was du in einer Instanz sehen und tun darfst. Attendix kennt die Rollen [[Administrator]], [[Verantwortlicher]], [[Helfer]], [[Stimmführer]], [[Stimmführer-Helfer]], [[Mitglied]], [[Beobachter]], [[Elternteil]] und [[Bewerber]]. Deine Rolle wird von einem Administrator vergeben und kann pro Instanz unterschiedlich sein.',
  },
  {
    id: 'administrator',
    term: 'Administrator',
    aliases: ['Admin'],
    definition: 'Rolle mit vollem Zugriff auf alle Funktionen einer Instanz: Personen- und Werkeverwaltung, Einstellungen, Statistiken, Export und Benutzerverwaltung.',
  },
  {
    id: 'verantwortlicher',
    term: 'Verantwortlicher',
    definition: 'Rolle mit adminähnlichem Zugriff auf Anwesenheiten, Planung und Auswertungen, jedoch ohne einige heikle Verwaltungsfunktionen (z. B. Löschen der Instanz), die dem [[Administrator]] vorbehalten sind.',
  },
  {
    id: 'helfer',
    term: 'Helfer',
    definition: 'Rolle mit eingeschränktem Schreibzugriff, meist auf die Anwesenheitspflege der eigenen Gruppe/Stimme beschränkt. Sieht die Personenliste nur lesend.',
  },
  {
    id: 'stimmfuehrer',
    term: 'Stimmführer',
    aliases: ['Stimmführerin', 'Sektionsleiter', 'Voice Leader'],
    definition: 'Verantwortlich für eine bestimmte Stimme/Gruppe (z. B. 1. Violine, Alt). Kann je nach Einstellung die Anwesenheit der eigenen Gruppe einsehen oder pflegen und wird häufig als Dirigent/Leitung in der [[Historie]] hinterlegt.',
  },
  {
    id: 'stimmfuehrer-helfer',
    term: 'Stimmführer-Helfer',
    definition: 'Kombinierte Rolle aus [[Stimmführer]] und [[Helfer]]: kann für die eigene Gruppe zusätzlich die Anwesenheit markieren.',
  },
  {
    id: 'mitglied',
    term: 'Mitglied',
    aliases: ['Spieler', 'Player'],
    definition: 'Reguläres Vereinsmitglied ohne Verwaltungsrechte. Kann die eigene [[Stammdaten|Stammdatenübersicht]] einsehen und über die "Meine Anwesenheit"-Ansicht selbst an- oder abmelden.',
  },
  {
    id: 'beobachter',
    term: 'Beobachter',
    aliases: ['Viewer'],
    definition: 'Rolle mit reinem Lesezugriff, z. B. auf Anwesenheiten und Statistiken, ohne etwas ändern zu können.',
  },
  {
    id: 'elternteil',
    term: 'Elternteil',
    aliases: ['Eltern', 'Parent'],
    definition: 'Rolle für Eltern minderjähriger Mitglieder. Kann die Anwesenheit der eigenen Kinder einsehen und für sie an-/abmelden.',
  },
  {
    id: 'bewerber',
    term: 'Bewerber',
    aliases: ['Applicant'],
    definition: 'Vorläufige Rolle nach einer Selbstregistrierung. Ein Bewerber hat eingeschränkten Zugriff, bis ein Administrator die Anfrage bestätigt und eine reguläre Rolle vergibt.',
  },
  {
    id: 'anwesenheitsstatus',
    term: 'Anwesenheitsstatus',
    aliases: ['Status'],
    definition: 'Zeigt für jede Person zu jedem Termin an, ob sie Anwesend, Entschuldigt, Verspätet, Abwesend, Verspätet (entschuldigt) oder noch nicht markiert (Neutral) ist. Durch Antippen wechselt der Status in einer festen Reihenfolge (Statuszyklus), die pro Termin-Typ konfiguriert werden kann.',
  },
  {
    id: 'ausfallgrund',
    term: 'Ausfallgrund',
    aliases: ['Abwesenheitsgrund'],
    definition: 'Vordefinierter Grund (z. B. "Krankheitsbedingt", "Urlaubsbedingt"), der beim Entschuldigen einer Abwesenheit ausgewählt werden kann. Die Liste der Gründe ist pro Instanz in den Einstellungen anpassbar.',
  },
  {
    id: 'verspaetungsgrund',
    term: 'Verspätungsgrund',
    definition: 'Vordefinierter Grund für ein verspätetes Erscheinen, analog zum [[Ausfallgrund]], ebenfalls pro Instanz konfigurierbar.',
  },
  {
    id: 'kritische-person',
    term: 'Kritische Person',
    aliases: ['Diva-Index'],
    definition: 'Eine Person, die eine hinterlegte Regel für unentschuldigte Abwesenheiten überschreitet (z. B. mehr als 3 unentschuldigte Fehlzeiten in 3 Monaten). Kritische Personen werden im Dashboard und in der Statistik hervorgehoben, damit rechtzeitig reagiert werden kann.',
  },
  {
    id: 'ablaufplan',
    term: 'Ablaufplan',
    aliases: ['Plan', 'Programmablauf'],
    definition: 'Der zeitliche Ablauf einer Probe oder Aufführung: eine Liste von Programmpunkten (Werke, Ansprachen, Pausen) mit Dauer, Uhrzeit und zuständiger Leitung. Kann für einen Termin erstellt, als PDF exportiert oder per Link geteilt werden.',
  },
  {
    id: 'schichtplan',
    term: 'Schichtplan',
    aliases: ['Schicht'],
    definition: 'Ein wiederkehrender Zeitplan aus Arbeits- und Freiblöcken (z. B. für Schichtarbeiter), der einer Person zugewiesen wird. Fällt ein Termin in ihre Arbeitszeit, wird die Person dafür automatisch entschuldigt.',
  },
  {
    id: 'treffen',
    term: 'Treffen',
    aliases: ['Meeting', 'Besprechung'],
    definition: 'Ein Eintrag für eine Besprechung der Leitung oder des Teams (Datum, Teilnehmende, Notizen) — getrennt von normalen Proben-/Aufführungsterminen.',
  },
  {
    id: 'uebergabe',
    term: 'Übergabe',
    aliases: ['Handover'],
    definition: 'Verschiebt eine Person von einer Instanz in eine andere Instanz derselben [[Organisation]], inklusive Zuordnung zu einer passenden [[Gruppe]] in der Ziel-Instanz.',
  },
  {
    id: 'stammdaten',
    term: 'Stammdaten',
    aliases: ['Profil'],
    definition: 'Die persönlichen Daten einer Person: Name, Geburtsdatum, Kontaktdaten, Gruppe/Instrument, Eintrittsdatum und ggf. Zusatzfelder. Werden unter "Personen" gepflegt.',
  },
  {
    id: 'gruppe',
    term: 'Gruppe',
    aliases: ['Instrument', 'Stimme', 'Sektion'],
    definition: 'Organisiert Mitglieder nach Instrument oder Stimme (z. B. "Klarinette", "Sopran"). Gruppen können zu Kategorien zusammengefasst werden und bestimmen u. a., welche Notenteile einer Person zugeordnet werden.',
  },
  {
    id: 'hauptgruppe',
    term: 'Hauptgruppe',
    definition: 'Eine besondere [[Gruppe]] für Personen mit Leitungsfunktion (z. B. Dirigenten, Chorleiter, Vorstand), die bei der Ersteinrichtung einer Instanz automatisch angelegt wird. Sie kann nicht gelöscht werden, ihre Mitglieder erhalten automatisch erweiterte Rechte (Rolle [[Verantwortlicher]]) und sie erscheint nicht in Notenteil- oder Instrumentenlisten.',
  },
  {
    id: 'werk',
    term: 'Werk',
    aliases: ['Stück', 'Song', 'Titel'],
    definition: 'Ein Musikstück in der Werke-Bibliothek, mit Nummer, Namen, Schwierigkeitsgrad, Kategorien und ggf. hinterlegten Notendateien je Gruppe/Stimme.',
  },
  {
    id: 'historie',
    term: 'Historie',
    definition: 'Aufzeichnung, welches [[Werk]] bei welchem Termin gespielt wurde und wer die Leitung (Dirigent/Chorleiter) hatte. Grundlage für "zuletzt gespielt"-Angaben und Dirigenten-Auswahl im [[Ablaufplan]].',
  },
  {
    id: 'checkliste',
    term: 'Checkliste',
    definition: 'Liste von Aufgaben, die zu einem Termin erledigt werden müssen (z. B. "Noten mitbringen"), optional mit einer Frist relativ zum Termin (z. B. "1 Tag vorher").',
  },
  {
    id: 'organisation',
    term: 'Organisation',
    definition: 'Verbindet mehrere Instanzen (z. B. mehrere Chöre eines Dachvereins) miteinander, damit organisationsweite Ablaufpläne, eine gemeinsame Werke-Bibliothek und gemeinsame Personen-Zusatzfelder genutzt werden können.',
  },
  {
    id: 'zusatzfeld',
    term: 'Zusatzfeld',
    aliases: ['Extra-Feld'],
    definition: 'Ein frei definierbares zusätzliches Datenfeld (Text, Zahl, Datum, Ja/Nein, Auswahl) für Personen oder Werke. Personenfelder können nur für eine Instanz oder organisationsweit angelegt werden; organisationsweite Werte werden für dieselbe Person in allen verbundenen Instanzen gemeinsam verwendet.',
  },
];
