import { FieldSelection } from '../utilities/interfaces';

export interface PublicPlanningTemplate {
  id: string;
  name: string;
  startTime?: string;   // 'HH:mm'
  fields: FieldSelection[];
}

export const PUBLIC_PLANNING_TEMPLATES: PublicPlanningTemplate[] = [
  {
    id: 'gottesdienst', name: 'Gottesdienst', startTime: '09:40', fields: [
      { id: 'g-1', name: 'Gemeinsamer Gesang',    time: '20' },
      { id: 'g-2', name: 'Segensgebet',           time: '5' },
      { id: 'g-3', name: 'Gemeinsamer Gesang',    time: '5' },
      { id: 'g-4', name: '1. Predigt mit Gebet',  time: '20' },
      { id: 'g-5', name: 'Gemeinsamer Gesang',    time: '5' },
      { id: 'noteFld-1', name: '4 & 5 jährige Kinder gehen zur Sonntgsschule', time: '0' },
      { id: 'g-6', name: '1. Werk',               time: '5' },
      { id: 'g-7', name: 'Programm',              time: '15' },
      { id: 'g-8', name: '2. Werk',               time: '5' },
      { id: 'g-9', name: 'Gemeinsamer Gesang',    time: '5' },
      { id: 'g-10', name: '2. Predigt',           time: '15' },
      { id: 'g-11', name: '3. Werk',              time: '3' },
      { id: 'g-12', name: 'Gemeinsamer Gesang',   time: '2' },
      { id: 'g-13', name: 'Abschlusspredigt mit Gebet',   time: '25' },
      { id: 'g-14', name: 'Vermeldungen',   time: '10' },
    ]
  },
  {
    id: 'chorprobe', name: 'Chorprobe', startTime: '19:30', fields: [
      { id: 'c-1', name: 'Segensgebet',         time: '10' },
      { id: 'c-2', name: 'Einsingen',         time: '10' },
      { id: 'c-3', name: 'Werk 1 proben',     time: '22' },
      { id: 'c-4', name: 'Werk 2 proben',     time: '22' },
      { id: 'c-5', name: 'Werk 3 proben',     time: '22' },
      { id: 'c-6', name: 'Abschluss',     time: '4' },
    ]
  },
  {
    id: 'orchesterprobe', name: 'Orchesterprobe', startTime: '19:30', fields: [
      { id: 'o-1', name: 'Segensgebet',        time: '10' },
      { id: 'o-2', name: 'Registerproben',    time: '20' },
      { id: 'o-3', name: 'Werk 1 (Tutti)',    time: '20' },
      { id: 'o-4', name: 'Werk 2 (Tutti)',    time: '20' },
      { id: 'o-5', name: 'Werk 3 (Tutti)',    time: '20' },
    ]
  },
];

/**
 * Klont die Felder eines Templates und vergibt frische, eindeutige IDs, damit
 * Reorder-/Edit-Tracking nicht kollidiert, wenn dieselbe Vorlage zweimal in
 * einer Session angewendet wird.
 */
export function cloneTemplateFields(tpl: PublicPlanningTemplate): FieldSelection[] {
  const stamp = Date.now();
  return tpl.fields.map((f, i) => ({
    ...f,
    id: f.id.startsWith('noteFld') ? `noteFld ${stamp}-${i}` : `${stamp}-${i}`,
  }));
}
