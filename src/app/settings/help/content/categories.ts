import { HelpCategory } from './types';

export const HELP_CATEGORIES: HelpCategory[] = [
  { id: 'getting-started', label: 'Erste Schritte', icon: 'rocket-outline', order: 1 },
  { id: 'attendance', label: 'Anwesenheit', icon: 'checkmark-done-outline', order: 2 },
  { id: 'people', label: 'Personen', icon: 'people-outline', order: 3 },
  { id: 'planning', label: 'Ablaufplan', icon: 'list-outline', order: 4 },
  { id: 'songs', label: 'Werke', icon: 'musical-notes-outline', order: 5 },
  { id: 'self-service', label: 'Meine Anwesenheit', icon: 'person-circle-outline', order: 6 },
  { id: 'settings', label: 'Einstellungen', icon: 'settings-outline', order: 7 },
  { id: 'other', label: 'Weitere Funktionen', icon: 'ellipsis-horizontal-circle-outline', order: 8 },
];
