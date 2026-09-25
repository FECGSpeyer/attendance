import { HelpArticle } from '../types';

export const SETTINGS_ARTICLES: HelpArticle[] = [
  {
    id: 'settings-general',
    title: 'Vereinsdaten und Termin-Typen',
    categoryId: 'settings',
    keywords: ['allgemein', 'name ändern', 'saison', 'termintyp'],
    body: `Unter "Einstellungen → Allgemein" pflegst du Vereinsname, Saisonstart, Standard-Probezeiten sowie die Termin-Typen (z. B. Probe, Aufführung, [[Arbeitseinsatz]]) inklusive deren Standard-[[Ablaufplan]] und [[Anwesenheitsstatus]]-Zyklus.`,
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
];
