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
];
