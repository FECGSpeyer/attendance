import { GlossaryTermTranslation } from '../types';

export const GLOSSARY_EN: Record<string, GlossaryTermTranslation> = {
  'instanz': {
    term: 'Instance',
    aliases: ['Tenant', 'Club', 'Group (instance)'],
    definition: 'The club, choir, orchestra or group you work for in Attendix. An account can be linked to several instances, and you can switch between them via "Switch instance" in the settings. All data (people, events, pieces, ...) is kept separately per instance.',
  },
  'rolle': {
    term: 'Role',
    definition: 'Determines what you can see and do in an instance. Attendix has the roles [[Administrator]], [[Person in charge]], [[Helper]], [[Section leader]], [[Section leader & helper]], [[Member]], [[Observer]], [[Parent]] and [[Applicant]]. Your role is assigned by an administrator and can differ per instance.',
  },
  'administrator': {
    term: 'Administrator',
    aliases: ['Admin'],
    definition: 'Role with full access to all functions of an instance: managing people and pieces, settings, statistics, export and user management.',
  },
  'verantwortlicher': {
    term: 'Person in charge',
    definition: 'Role with admin-like access to attendance, planning and analytics, but without some sensitive management functions (e.g. deleting the instance) that are reserved for the [[Administrator]].',
  },
  'helfer': {
    term: 'Helper',
    definition: 'Role with limited write access, usually restricted to keeping attendance for their own group/section. Can only read the list of people.',
  },
  'stimmfuehrer': {
    term: 'Section leader',
    aliases: ['Voice leader'],
    definition: 'Responsible for a specific section/group (e.g. 1st violin, alto). Depending on the settings, can view or keep the attendance of their own group and is often recorded as conductor/leader in the [[History]].',
  },
  'stimmfuehrer-helfer': {
    term: 'Section leader & helper',
    definition: 'Combined role of [[Section leader]] and [[Helper]]: can also mark attendance for their own group.',
  },
  'mitglied': {
    term: 'Member',
    aliases: ['Player'],
    definition: 'Regular club member without management rights. Can view their own [[Personal details|personal details]] and sign in or out themselves in the "My attendance" view.',
  },
  'beobachter': {
    term: 'Observer',
    aliases: ['Viewer'],
    definition: 'Role with read-only access, e.g. to attendance and statistics, without being able to change anything.',
  },
  'elternteil': {
    term: 'Parent',
    aliases: ['Parents'],
    definition: 'Role for parents of underage members. Can see the attendance of their own children and sign them in or out.',
  },
  'bewerber': {
    term: 'Applicant',
    definition: 'Temporary role after self-registration. An applicant has limited access until an administrator approves the request and assigns a regular role.',
  },
  'anwesenheitsstatus': {
    term: 'Attendance status',
    aliases: ['Status'],
    definition: 'Shows for every person at every event whether they are present, excused, late, absent, late (excused) or not yet marked (neutral). Tapping it moves the status on in a fixed order (status cycle), which can be configured per event type.',
  },
  'ausfallgrund': {
    term: 'Absence reason',
    definition: 'Predefined reason (e.g. "Illness", "Holiday") that can be picked when excusing an absence. The list of reasons can be adjusted per instance in the settings.',
  },
  'verspaetungsgrund': {
    term: 'Lateness reason',
    definition: 'Predefined reason for arriving late, like the [[Absence reason]], also configurable per instance.',
  },
  'kritische-person': {
    term: 'Critical person',
    aliases: ['Diva index'],
    definition: 'A person who exceeds a stored rule for unexcused absences (e.g. more than 3 unexcused absences in 3 months). Critical people are highlighted on the dashboard and in the statistics so you can react in time.',
  },
  'ablaufplan': {
    term: 'Run sheet',
    aliases: ['Plan', 'Programme'],
    definition: 'The schedule of a rehearsal or performance: a list of items (pieces, speeches, breaks) with duration, time and who leads them. Can be created for an event, exported as PDF or shared via link.',
  },
  'schichtplan': {
    term: 'Shift plan',
    aliases: ['Shift'],
    definition: 'A recurring schedule of work and free blocks (e.g. for shift workers) that is assigned to a person. If an event falls into their working time, the person is excused automatically.',
  },
  'uebergabe': {
    term: 'Handover',
    definition: 'Moves a person from one instance to another instance of the same [[Organisation]], including assigning them to a matching [[Group]] in the target instance.',
  },
  'stammdaten': {
    term: 'Personal details',
    aliases: ['Profile'],
    definition: 'The personal data of a person: name, date of birth, contact details, group/instrument, joining date and any additional fields. They are maintained under "People".',
  },
  'gruppe': {
    term: 'Group',
    aliases: ['Instrument', 'Voice', 'Section'],
    definition: 'Organises members by instrument or voice (e.g. "Clarinet", "Soprano"). Groups can be combined into categories and determine, among other things, which sheet music parts are assigned to a person.',
  },
  'hauptgruppe': {
    term: 'Main group',
    definition: 'A special [[Group]] for people in leading roles (e.g. conductors, choir leaders, board) that is created automatically when an instance is set up. It cannot be deleted, its members automatically get extended rights (role [[Person in charge]]) and it does not appear in sheet music part or instrument lists.',
  },
  'werk': {
    term: 'Piece',
    aliases: ['Song', 'Title', 'Work'],
    definition: 'A piece of music in the piece library, with number, name, difficulty, categories and possibly sheet music files per group/voice.',
  },
  'historie': {
    term: 'History',
    definition: 'Record of which [[Piece]] was played at which event and who led it (conductor/choir leader). This is the basis for "last played" information and the conductor selection in the [[Run sheet]].',
  },
  'checkliste': {
    term: 'Checklist',
    definition: 'List of tasks that need to be done for an event (e.g. "Bring sheet music"), optionally with a deadline relative to the event (e.g. "1 day before").',
  },
  'organisation': {
    term: 'Organisation',
    definition: 'Connects several instances (e.g. several choirs of an umbrella association) so they can use organisation-wide run sheets, a shared piece library and shared additional person fields.',
  },
  'zusatzfeld': {
    term: 'Additional field',
    aliases: ['Extra field'],
    definition: 'A freely definable extra data field (text, number, date, yes/no, selection) for people or pieces. Person fields can be created for one instance only or organisation-wide; organisation-wide values are shared for the same person across all connected instances.',
  },
  'teamorganisation': {
    term: 'Team organisation',
    definition: 'Tools for board or leadership team meetings: [[Topic store]], agenda in the [[Run sheet]], minutes and tasks. Visible as soon as "Minutes & agenda" is switched on for at least one event type; you find it under More → Planning.',
  },
  'top': {
    term: 'Agenda item',
    aliases: ['Agenda items'],
    definition: 'A topic from the [[Topic store]] that appears as its own item with time, duration and person responsible in the [[Run sheet]] of an event. In the minutes, the lead records the outcome of each agenda item (discussed, decided, postponed).',
  },
  'themenspeicher': {
    term: 'Topic store',
    definition: 'List of open topics in the [[Team organisation]] that still need to be discussed. The lead creates topics or takes on suggestions from members and schedules them as an [[Agenda item]] for an event.',
  },
  'protokoll-freigeben': {
    term: 'Publish minutes',
    aliases: ['Published', 'Publish'],
    definition: 'Makes minutes readable for the [[Audience]] of the event type and notifies those present and people with tasks from the meeting. Before that, they are a draft only the lead can see.',
  },
  'personenkreis': {
    term: 'Audience',
    definition: 'Everyone in the relevant groups of an event type with "Minutes & agenda" (without groups: all members), except parents and applicants. They can read published minutes and suggest topics.',
  },
  'dienst-modus': {
    term: 'Duty mode',
    aliases: ['Duty roster', 'Duty'],
    definition: 'Setting of an event type for duties such as sound engineering: per event only as many people are needed as set. The lead assigns people, or people sign up themselves; only assigned people count towards the quota.',
  },
  'springer': {
    term: 'Stand-in',
    aliases: ['Stand-ins'],
    definition: 'Person from the duty team who is not assigned to a duty. Stand-ins get a message when someone drops out and can take over the duty.',
  },
  'regelmaessig-verhindert': {
    term: 'Regularly unavailable',
    aliases: ['Availability'],
    definition: 'Rule for the weekdays on which a person generally cannot come. New events on these days are entered as excused automatically.',
  },
};
