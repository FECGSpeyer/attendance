import { HelpArticle } from '../types';

export const PEOPLE_ARTICLES: HelpArticle[] = [
  {
    id: 'people-add',
    title: 'Neue Person anlegen',
    categoryId: 'people',
    keywords: ['mitglied hinzufügen', 'neue person', 'anlegen'],
    body: `Unter "Mitglieder" kannst du über das Plus-Symbol eine neue Person anlegen: Name, Geburtsdatum, Kontaktdaten, [[Gruppe]]/Instrument und Eintrittsdatum. Zusätzlich können instanzspezifische [[Zusatzfeld|Zusatzfelder]] ausgefüllt werden.

Vergib direkt eine [[Rolle]] (z. B. [[Mitglied]] oder [[Helfer]]), damit die Person sich anmelden und die App entsprechend nutzen kann.`,
  },
  {
    id: 'people-info-mail',
    title: 'Welche E-Mail bekommt eine neu hinzugefügte Person?',
    categoryId: 'people',
    keywords: ['info mail', 'willkommensmail', 'einladung', 'zugang', 'passwort festlegen', 'account anlegen', 'benachrichtigung hinzugefügt'],
    body: `Legst du eine Person mit E-Mail-Adresse an und gibst ihr Zugang zur App, bekommt sie automatisch eine E-Mail:

- **Noch kein Attendix-Konto:** Es wird ein Konto angelegt. Die Willkommensmail nennt die [[Instanz]] und die vergebene [[Rolle]] und enthält einen Button, mit dem die Person ihr Passwort festlegt und sich anmeldet.
- **Bereits ein Attendix-Konto vorhanden:** Die Person bekommt eine Info-Mail, dass sie zu deiner Instanz hinzugefügt wurde, und meldet sich mit ihren bekannten Zugangsdaten an. Die neue Instanz erscheint dann in ihrer Instanzauswahl.

Kommt keine Mail an, lohnt sich ein Blick in den Spam-Ordner und eine Prüfung der hinterlegten E-Mail-Adresse.`,
  },
  {
    id: 'people-roles',
    title: 'Rollen vergeben und ändern',
    categoryId: 'people',
    keywords: ['rolle zuweisen', 'rechte', 'berechtigungen', 'admin machen'],
    body: `In den [[Stammdaten]] einer Person legt ein [[Administrator]] oder [[Verantwortlicher]] die [[Rolle]] fest. Die Rolle steuert, was die Person sehen und bearbeiten darf — von [[Beobachter]] (nur lesen) bis [[Administrator]] (voller Zugriff).

Eine Person kann in unterschiedlichen [[Instanz|Instanzen]] unterschiedliche Rollen haben.`,
  },
  {
    id: 'people-pending',
    title: 'Anmeldungen bestätigen',
    categoryId: 'people',
    keywords: ['bewerber', 'selbstregistrierung', 'freischalten', 'genehmigen'],
    body: `Wenn sich jemand über einen Registrierungslink selbst anmeldet, erscheint die Person zunächst als [[Bewerber]] in einer Warteliste. Ein [[Administrator]] oder [[Verantwortlicher]] prüft die Anfrage und bestätigt sie mit einer passenden [[Rolle]] oder lehnt sie ab.`,
  },
  {
    id: 'people-pause-leave',
    title: 'Pausieren und Austritt',
    categoryId: 'people',
    keywords: ['pausieren', 'austritt', 'archivieren', 'ehemalige'],
    body: `Ist eine Person vorübergehend nicht aktiv (z. B. Elternzeit, Verletzung), kann sie pausiert werden, ohne die [[Stammdaten]] zu löschen. Verlässt jemand den Verein endgültig, wird die Person als "ausgetreten" markiert und erscheint in der Liste der ehemaligen Mitglieder, bleibt aber für die Historie erhalten.`,
  },
  {
    id: 'people-church-overview',
    title: 'Gemeinde-Übersicht',
    categoryId: 'people',
    keywords: ['gemeinden', 'gemeinde zählen', 'herkunft', 'statistik gemeinde', 'bfecg'],
    body: `Gibt es in deiner Instanz ein [[Zusatzfeld]] vom Typ "BFECG Gemeinde", findest du die Gemeinde-Übersicht in der Personenliste (Filter-Menü) und in einem Termin (Optionen-Menü). Sie zeigt, wie viele Personen aus welcher Gemeinde kommen und wie viele keiner Gemeinde zugeordnet sind.

In der Personenliste zählt die Übersicht die aktuell gefilterten Personen, im Termin nur die Anwesenden (inkl. verspätet).`,
  },
];
