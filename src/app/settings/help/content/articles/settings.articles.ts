import { HelpArticle } from '../types';

export const SETTINGS_ARTICLES: HelpArticle[] = [
  {
    id: 'settings-general',
    title: 'Vereinsdaten und Termin-Typen',
    categoryId: 'settings',
    keywords: ['allgemein', 'name ändern', 'saison', 'termintyp'],
    body: `Unter "Einstellungen → Allgemein" pflegst du Vereinsname, Saisonstart, Standard-Probezeiten sowie die Termin-Typen (z. B. Probe, Aufführung, Arbeitseinsatz) inklusive deren Standard-[[Ablaufplan]] und [[Anwesenheitsstatus]]-Zyklus.`,
  },
  {
    id: 'settings-roles',
    title: 'Rollenrechte konfigurieren',
    categoryId: 'settings',
    keywords: ['rollenrechte', 'berechtigungen einstellen', 'sichtbarkeit'],
    body: `Unter "Einstellungen → Rollenrechte" legst du für jede [[Rolle]] fest, was sie sehen und bearbeiten darf, z. B. ob [[Helfer]] Notizen zu Personen sehen dürfen oder ob eine [[Checkliste]] für [[Mitglied|Mitglieder]] sichtbar ist.`,
  },
  {
    id: 'settings-notifications',
    title: 'Benachrichtigungen einrichten',
    categoryId: 'settings',
    keywords: ['push', 'telegram', 'email benachrichtigung'],
    body: `Unter "Benachrichtigungen" aktivierst du Push-, Telegram- oder E-Mail-Benachrichtigungen für dich persönlich, z. B. für Geburtstage, neue An-/Abmeldungen oder [[Kritische Person|kritische Personen]]. Die Telegram-Anbindung erfolgt über den @attendix_bot.`,
  },
  {
    id: 'settings-switch-instance',
    title: 'Instanz wechseln, favorisieren oder löschen',
    categoryId: 'settings',
    keywords: ['instanz wechseln', 'instanz löschen', 'verein löschen', 'favorit', 'swipe', 'wischen'],
    body: `Über "Einstellungen → Instanz wechseln" siehst du alle [[Instanz|Instanzen]], mit denen dein Konto verknüpft ist.

Wische auf einem Instanz-Eintrag nach links, um zwei Aktionen einzublenden:
- **Stern**: Instanz als Favorit markieren (wird beim Öffnen der App bevorzugt ausgewählt).
- **Papierkorb**: Instanz endgültig löschen.

Das Löschen ist nur als [[Administrator]] möglich und muss durch Eingabe des vollständigen Instanznamens bestätigt werden, da es nicht rückgängig gemacht werden kann.`,
  },
  {
    id: 'settings-feedback',
    title: 'Feedback senden',
    categoryId: 'settings',
    keywords: ['feedback', 'kontakt', 'fehler melden', 'bug melden'],
    body: `Findest du hier keine Antwort auf deine Frage oder möchtest du einen Fehler melden bzw. eine Idee einreichen? Nutze dazu "Einstellungen → Feedback geben".`,
  },
  {
    id: 'settings-critical-rules',
    title: 'Regeln für kritische Personen',
    categoryId: 'settings',
    keywords: ['problemfall', 'kritische regel', 'schwellenwert', 'unentschuldigt'],
    body: `Unter "Einstellungen → Allgemein" legst du fest, wann jemand als [[Kritische Person]] gilt. Eine Regel besteht aus:

- **Schwellenwert-Art**: eine feste Anzahl (z. B. "3 Fehltage") oder ein Prozentsatz (z. B. "20 % Abwesenheit").
- **Zeitraum**: die letzten X Tage, seit Saisonbeginn oder über alle Zeit.
- **Berücksichtigte Status**: welche [[Anwesenheitsstatus]]-Werte zählen (z. B. nur "Abwesend", oder auch "Verspätet").
- **Termin-Typen**: auf welche Termin-Typen die Regel angewendet wird.

Du kannst mehrere Regeln anlegen und festlegen, ob bereits eine erfüllte Regel reicht ("Oder") oder alle gleichzeitig erfüllt sein müssen ("Und").`,
  },
  {
    id: 'settings-extra-fields',
    title: 'Zusatzfelder anlegen',
    categoryId: 'settings',
    keywords: ['zusatzfeld erstellen', 'eigenes feld', 'custom field', 'organisationsweit', 'gemeinsame personendaten'],
    body: `Unter "Einstellungen → Allgemein → Zusatzfelder" erstellst du eigene [[Zusatzfeld|Zusatzfelder]] für Personen oder für [[Werk|Werke]] — getrennt konfigurierbar.

Verfügbare Feldtypen: Text, mehrzeiliger Text, Zahl, Datum, Ja/Nein sowie Auswahl (mit selbst definierten Optionen). Zu jedem Feld kannst du einen Standardwert setzen und festlegen, ob [[Mitglied|Mitglieder]] es sehen bzw. selbst bearbeiten dürfen.

Diese Felder gelten nur für die aktuelle [[Instanz]]. Gehört die Instanz zu einer [[Organisation]], können [[Administrator|Administratoren]] unter "Einstellungen → Organisation → Personen-Zusatzfelder" zusätzlich organisationsweite Personenfelder anlegen. Deren Werte sind in allen Instanzen der Organisation gleich, sobald die Person über ihr Attendix-Konto oder über "Personen verknüpfen" eindeutig zugeordnet ist. Änderungen in einer Instanz sind dadurch auch in den anderen Instanzen sichtbar.`,
  },
  {
    id: 'settings-registration-link',
    title: 'Registrierungslink freigeben',
    categoryId: 'settings',
    keywords: ['einladungslink', 'anmeldelink', 'selbstregistrierung aktivieren', 'link kopieren'],
    body: `Unter "Einstellungen → Allgemein" aktivierst du "Registrierung erlauben", damit neue Personen sich über einen Link selbst anmelden können. Attendix erzeugt dabei einen individuellen Link (attendix.de/register/…), den du kopieren und z. B. per WhatsApp oder E-Mail teilen kannst.

Zusätzlich legst du fest, welche Angaben bei der Anmeldung abgefragt werden (Name, Geburtsdatum, Foto, [[Gruppe]], [[Zusatzfeld|Zusatzfelder]] …) und ob neue Anmeldungen automatisch freigeschaltet werden oder als [[Bewerber]] auf eine Bestätigung warten.`,
  },
  {
    id: 'settings-delete-account',
    title: 'Konto vollständig löschen',
    categoryId: 'settings',
    keywords: ['account löschen', 'konto löschen', 'daten löschen'],
    body: `"Einstellungen → Konto löschen" entfernt dein Attendix-Konto **vollständig und über alle [[Instanz|Instanzen]] hinweg** — nicht nur aus der aktuell geöffneten Instanz. Dabei werden dein Profil, alle Mitgliedschaften und alle mit dir verknüpften Anwesenheitsdaten gelöscht.

Zur Sicherheit musst du einen angezeigten Bestätigungscode eintippen. Der Vorgang kann danach nicht rückgängig gemacht werden.`,
  },
];
