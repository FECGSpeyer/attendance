import { AttendanceStatus, FieldType, PlayerHistoryType, Role } from './constants';

export interface AuthObject {
  login: boolean;
}

export enum CriticalRuleOperator {
  AND = 'AND',
  OR = 'OR',
}

export enum CriticalRuleThresholdType {
  COUNT = 'count',
  PERCENTAGE = 'percentage',
}

export enum CriticalRulePeriodType {
  DAYS = 'days',           // Last X days (original behavior)
  SEASON = 'season',       // Since season start
  ALL_TIME = 'all',        // Entire history
}

export interface CriticalRule {
  id: string;
  name?: string;                   // Optional: Display name for the rule
  attendance_type_ids: string[];   // Which attendance types to check
  statuses: AttendanceStatus[];    // Which statuses count (e.g., Absent, Late)
  threshold_type: CriticalRuleThresholdType;
  threshold_value: number;         // e.g., 3 for count, or 20 for percentage
  period_type?: CriticalRulePeriodType;  // Type of period to check (optional for legacy rules)
  period_days?: number;            // Used when period_type === 'days' or for legacy rules
  operator: CriticalRuleOperator;  // How to combine with other rules
}

export interface Tenant {
  id?: number;
  created_at?: string;
  shortName: string;
  longName: string;
  logo_url?: string;
  branding_text?: string;
  maintainTeachers: boolean;
  showHolidays: boolean;
  type: string;
  withExcuses: boolean;
  practiceStart?: string;
  practiceEnd?: string;
  seasonStart?: string;
  parents?: boolean;
  betaProgram: boolean;
  region?: string;
  role?: Role;
  song_sharing_id?: string;
  song_source_tenant_id?: number | null;
  additional_fields?: ExtraField[];
  perc?: string;
  percColor?: string;
  register_id?: string;
  auto_approve_registrations?: boolean;
  registration_fields?: string[];
  favorite?: boolean;
  critical_rules?: CriticalRule[];
  timezone: string;
  showMembersList?: boolean;
  shift_excused_as_present?: boolean;
  show_all_attendances?: boolean;
  show_all_attendances_info_text?: string;
  song_additional_fields?: ExtraField[];
  absence_reasons?: string[];
  late_reasons?: string[];
  plan_block_templates?: PlanBlockTemplate[];
  files_enabled?: boolean;
  files_shared?: boolean;
  files_max_bytes?: number | null;
  /** "Meine Termine" as duty roster view (C4) for members of a duty circle. */
  duty_view?: boolean;
  /** Standardsprache der Instanz (de/en/ru/es) für Standarddaten und Feeds. */
  default_language?: string;
}

export interface ExtraField {
  id: string;
  name: string;
  type: FieldType;
  defaultValue: any;
  options?: string[];
  visibleToPlayers?: boolean;
  editableByPlayers?: boolean;
  displayMode?: 'chip' | 'underneath';
}

export interface TenantUser {
  id?: number;
  created_at?: string;
  tenantId: number;
  userId: string;
  role: number;
  email: string;
  telegram_chat_id?: string;
  favorite: boolean;
  parent_id?: number;
}

export interface TenantRolePermission {
  id?: number;
  created_at?: string;
  tenant_id: number;
  role: number;
  attendance_all_groups: boolean;
  attendance_create: boolean;
  player_notes_view: boolean;
  checklist_view: boolean;
  player_self_pause: boolean;
  player_planned_absence: boolean;
}

export type DashboardCardId = 'birthdays' | 'calendar' | 'next-event' | 'member-changes' | 'absences' | 'critical-persons' | 'current-songs' | 'current-plan' | 'my-tasks';

export interface DashboardCardConfig {
  id: DashboardCardId;
  visible: boolean;
}

export const DEFAULT_DASHBOARD_CARDS: DashboardCardConfig[] = [
  { id: 'birthdays', visible: true },
  { id: 'calendar', visible: true },
  { id: 'next-event', visible: true },
  { id: 'member-changes', visible: true },
  { id: 'absences', visible: true },
  { id: 'critical-persons', visible: true },
  { id: 'current-songs', visible: true },
  { id: 'current-plan', visible: true },
  { id: 'my-tasks', visible: true },
];

export interface PlayerAbsence {
  id?: string;
  created_at?: string;
  created_by?: string;
  tenant_id: number;
  person_id: number;
  from_date: string;
  until_date: string;
  reason: string;
}

export interface NotificationConfig {
  id: string;
  created_at: string;
  enabled: boolean;
  telegram_chat_id: string;
  birthdays: boolean;
  signins: boolean;
  signouts: boolean;
  enabled_tenants?: number[];
  updates: boolean;
  registrations: boolean;
  criticals: boolean;
  reminders: boolean;
  checklist: boolean;
  push_enabled?: boolean;
  push_and_telegram?: boolean;
  tasks?: boolean;
  messages?: boolean;
  /** Dienste: Einteilung, Erinnerung, unterbesetzt; null counts as on. */
  duties?: boolean | null;
  /** UI-Sprache (de/en/ru/es) für App, Push und E-Mails; null = nicht gewählt. */
  language?: string | null;
  /** Laufender Ablaufplan als Live Activity / Live-Benachrichtigung; null counts as on. */
  live_activity?: boolean | null;
}

export interface UserNotification {
  id: string;
  user_id: string | null;
  tenantId: number;
  type: string;
  title: string;
  body: string;
  channels: string[];
  email?: string | null;
  data: { attendanceId?: string; tenantId?: string; [key: string]: any };
  read: boolean;
  created_at: string;
}

export interface Viewer {
  id?: number;
  created_at?: string;
  appId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface Parent {
  id?: number;
  created_at?: string;
  appId: string;
  email: string;
  firstName: string;
  lastName: string;
}


export interface Person {
  id?: number;
  created_at?: string;
  lastName: string;
  firstName: string;
  birthday: string;
  joined: string;
  isPresent?: boolean;
  isLateExcused?: boolean;
  left?: string;
  email?: string;
  appId?: string;
  global_person_id?: string | null;
  notes: string;
  img?: string;
  attStatus?: AttendanceStatus;
  isConductor?: boolean;
  telegramId?: string;
  paused?: boolean;
  paused_until?: string;
  tenantId?: number;
  additional_fields?: { [key: string]: any };
  phone?: string;
  shift_id?: string;
  shift_name?: string;
  shift_start?: string;
  pending: boolean;
  self_register: boolean;
  tenants?: Tenant[];
}

export interface PlayerHistoryEntry {
  date: string;
  text: string;
  type: PlayerHistoryType;
}

export interface ChecklistItem {
  id: string;
  text: string;
  deadlineHours: number | null;
  completed?: boolean;
  dueDate?: string;
}

export type RegistrationFieldType = 'text' | 'boolean' | 'select' | 'multi_select';

export interface RegistrationField {
  id: string;
  label: string;
  type: RegistrationFieldType;
  options?: string[];
}

export interface Player extends Person {
  instrument: number;
  groupName?: string;
  hasTeacher: boolean;
  playsSince: string;
  isLeader: boolean;
  firstOfInstrument?: boolean;
  isNew?: boolean;
  instrumentLength?: number;
  teacher?: number;
  teacherName?: string;
  isCritical: boolean;
  lastSolve?: string;
  correctBirthday: boolean;
  history: PlayerHistoryEntry[];
  criticalReason?: PlayerHistoryType;
  criticalReasonText?: string;
  otherOrchestras?: string[];
  otherExercise?: string;
  text?: string;
  attNote?: string;
  testResult?: string;
  examinee?: boolean;
  range?: string;
  instruments?: string;
  tenantId: number;
  person_attendances?: PersonAttendance[];
  percentage?: number;
  lateCount?: number;  // Computed: unexcused late arrivals since lastSolve
  legacyId?: number;
  legacyConductorId?: number;
  parent_id?: number;
  newInstrument?: Group;
  sort_order?: number;
}

export interface Group {
  id?: number;
  created_at?: string;
  name: string;
  tuning?: string;
  notes?: string;
  range?: string;
  count?: number;
  clefs?: string[];
  clefText?: string;
  tenantId: number;
  maingroup: boolean;
  legacyId?: number;
  category?: number;
  firstOfCategory?: boolean;
  categoryName?: string;
  categoryLength?: number;
  categoryData?: GroupCategory;
  synonyms?: string;
  sort_order?: number;
}

export interface Attendance {
  id?: number;
  created_at?: string;
  created_by?: string;
  date: string;
  type?: string;
  type_id: string;
  save_in_history: boolean;
  percentage?: number;
  excused?: string[];
  criticalPlayers?: number[];
  typeInfo: string;
  notes: string;
  playerNotes?: { [prop: number]: string };
  img?: string;
  plan?: Plan;
  /** Further plans of the same Termin (e.g. one per day). `plan` stays the first one. */
  extra_plans?: Plan[] | null;
  share_plan?: boolean;
  share_key?: string;
  share_edit_key?: string;
  is_org_plan?: boolean;
  lateExcused?: string[];
  songs?: number[];
  tenantId?: number;
  persons?: PersonAttendance[];
  players?: { [prop: string]: AttendanceStatus | boolean };
  start_time?: string;
  end_time?: string;
  deadline?: string;
  duration_days?: number;
  checklist?: ChecklistItem[];
  description?: string;
  attachment_url?: string;
  attachment_name?: string;
  place?: string;
  files_folder?: string;
  /** Persons needed for this Termin (Dienst-Modus); null = type default. */
  duty_required?: number | null;
  duty_urgent_sent_at?: string | null;
  duty_alert_sent_at?: string | null;
}

export interface Plan {
  end: string;
  time: string;
  fields: FieldSelection[];
  title?: string;
  /** Stable id of an additional plan (see Attendance.extra_plans). */
  id?: string;
  /** Custom name shown on the plan chip; derived from day/index when empty. */
  label?: string;
  /** Day within a multi-day Termin, 0 = first day. */
  day?: number;
}

export interface SharedPlan {
  id: string;
  edit_key: string;
  plan_title?: string;
  date?: string;
  time?: string;
  end_time?: string;
  fields?: FieldSelection[];
  branding_id?: string;
  creator_user_id?: string | null;
  created_at?: string;
  org_id?: number | null;
}

export interface PersonAttendance {
  id?: string;
  attendance_id: number;
  person_id: number;
  status: AttendanceStatus;
  notes: string;
  firstName?: string;
  lastName?: string;
  img?: string;
  instrument?: number;
  groupName?: string;
  joined?: string;
  person?: Partial<Player>;
  attendance?: Partial<Attendance>;
  attended?: boolean;
  firstOfInstrument?: boolean;
  instrumentLength?: number;
  showDivider?: boolean;
  date?: string;
  text?: string;
  title?: string;
  songs?: number[];
  history?: History[];
  attId?: number;
  highlight?: boolean;
  typeId?: string;
  changed_by?: string;
  changed_at?: string;
  isMember?: boolean;
  registration_answers?: { [fieldId: string]: any };
  duty_state?: DutyState | null;
  duty_assigned_by?: string | null;
  duty_assigned_at?: string | null;
  duty_reminder_sent?: boolean;
}

export interface Song {
  id?: number;
  created_at?: string;
  tenantId?: number;
  name: string;
  number: number;
  prefix?: string;
  withChoir: boolean;
  withSolo: boolean;
  lastSung?: string;
  nextPlanned?: string;
  link?: string;
  conductor?: string;
  composer?: string;
  legacyId?: number;
  instrument_ids?: number[];
  files?: SongFile[];
  difficulty?: number;
  category?: string;
  category_ids?: string[];
  additional_fields?: { [key: string]: any };
}

export interface SongFile {
  storageName?: string;
  created_at: string;
  fileName: string;
  fileType: string;
  url: string;
  instrumentId?: number;
  note?: string;
}

export interface History {
  id?: number;
  created_at?: string;
  date: string;
  songId: number;
  number?: number;
  name?: string;
  conductorName?: string;
  otherConductor?: string;
  count?: number;
  tenantId?: number;
  person_id?: number;
  attendance_id?: number;
  visible?: boolean;
  attendance?: {
    date: string;
  };
  song?: Song;
}

export interface Teacher {
  id?: number;
  created_at?: string;
  name: string;
  instruments: number[];
  notes: string;
  insNames?: string;
  number: string;
  private: boolean;
  playerCount?: number;
  tenantId?: number;
  legacyId?: number;
}

export interface FieldSelection {
  id: string;
  name: string;
  time: string;
  conductor?: string;
  currentTime?: string;
  songId?: number;
  info?: string;
  /** Set when this plan field is an agenda item (TOP) of the team organisation. */
  agendaItemId?: string;
  /** Head of a Programmblock: stores 0 min, its duration is the sum of its Unterpunkte. */
  isGroup?: boolean;
  /** Id of the Programmblock head this Unterpunkt belongs to (see plan-groups.ts). */
  groupId?: string;
}

/** Saved Programmblock (head first, then its Unterpunkte) to insert into any plan. */
export interface PlanBlockTemplate {
  id: string;
  name: string;
  fields: FieldSelection[];
}

export interface GroupCategory {
  id?: number;
  created_at?: string;
  name: string;
  tenant_id?: number;
  sort_order?: number;
}

export interface Admin {
  created_at?: string;
  userId: string;
  email: string;
}

export interface Organisation {
  id?: number;
  created_at?: string;
  name: string;
  public_plan_key?: string;
  logo_url?: string;
  branding_text?: string;
  additional_fields?: ExtraField[];
  planning_templates?: Plan[];
  default_fields?: FieldSelection[];
}

export interface OrganisationPersonFieldValue {
  id?: number;
  created_at?: string;
  updated_at?: string;
  tenant_group: number;
  person_key: string;
  field_id: string;
  value: any;
}

export interface AttendanceType {
  id?: string;
  created_at?: string;
  name: string;
  default_status: AttendanceStatus;
  available_statuses: AttendanceStatus[];
  default_plan?: Plan;
  tenant_id: number;
  relevant_groups: number[];
  start_time?: string;
  end_time?: string;
  manage_songs: boolean;
  index?: number;
  visible: boolean;
  color: string;
  highlight: boolean;
  hide_name: boolean;
  include_in_average: boolean;
  all_day?: boolean;
  duration_days?: number;
  notification?: boolean;
  reminders: number[];
  additional_fields_filter?: {
    key: string;
    option: string | boolean;
  };
  checklist?: ChecklistItem[];
  registration_fields?: RegistrationField[];
  planning_title: string;
  planning_prefix_instance_name?: boolean;
  is_default_org_plan?: boolean;
  enable_protocol?: boolean;
  agenda_default_duration?: number;
  suggest_postponed?: boolean;
  place_enabled?: boolean;
  /** Dienst-Modus: only assigned persons are expected, others are stand-ins. */
  duty_mode?: boolean;
  /** Default number of persons needed per Termin (Dienst-Modus). */
  duty_required?: number;
  duty_self_signup?: boolean;
  /** Remind persons who have not confirmed an assignment after X days; null = off. */
  duty_confirm_reminder_days?: number | null;
  duty_notify_understaffed?: boolean;
  /** Urgent notification X hours before start when still understaffed; null = off. */
  duty_urgent_hours?: number | null;
}

export type DutyState = 'requested' | 'confirmed' | 'self';

/** Recurring weekday unavailability of a person ("regelmäßig verhindert"). */
export interface PersonUnavailability {
  id?: string;
  created_at?: string;
  created_by?: string | null;
  tenant_id: number;
  person_id: number;
  /** ISO weekdays, 1 = Monday … 7 = Sunday */
  weekdays: number[];
  /** Empty = all Termintypen */
  type_ids: string[];
  reason: string;
  valid_until?: string | null;
}

export interface ShiftPlan {
  id?: string;
  created_at?: string;
  name: string;
  description: string;
  tenant_id?: number;
  definition: ShiftDefinition[];
  shifts?: ShiftInstance[];
}

export interface ShiftDefinition {
  id?: number;
  start_time: string;
  duration: number;
  free: boolean;
  index: number;
  repeat_count: number;
}

export interface ShiftInstance {
  date: string;
  name: string;
}

export interface Church {
  id?: string;
  created_at?: string;
  created_from: string;
  name: string;
}

export interface Feedback {
  id?: number;
  created_at?: string;
  message: string;
  rating: number;
  anonymous: boolean;
  tenant_id?: number;
  user_id?: string;
  phone?: string;
}

export interface Question {
  id?: number;
  created_at?: string;
  message: string;
  anonymous: boolean;
  tenant_id?: number;
  user_id?: string;
}

export interface SongCategory {
  created_at?: string;
  id?: string;
  name: string;
  tenant_id: number;
  index: number;
}

export interface CrossTenantPersonAttendance extends PersonAttendance {
  tenantId: number;
  tenantName: string;
  tenantColor: string;
  attendanceType?: AttendanceType;
  /** Calendar only: Termin of a managed instance without own person entry, so no status. */
  eventOnly?: boolean;
}

// ============================================================
// Team Organization
// ============================================================

export const AGENDA_ITEMS_PLACEHOLDER_ID = 'agenda-items-placeholder';
export const PROTOCOL_GENERAL_SECTION_ID = '__general__';

export type AgendaItemStatus = 'open' | 'completed' | 'dropped';
export type AgendaItemPriority = 'low' | 'medium' | 'high';
export type AgendaItemProposalStatus = 'pending' | 'accepted' | 'rejected';
export type TaskStatus = 'open' | 'in_progress' | 'completed';
export type ProtocolStatus = 'draft' | 'published';
export type ProtocolOutcome = 'discussed' | 'decided' | 'postponed';

export interface AgendaItem {
  id?: string;
  created_at?: string;
  tenant_id: number;
  title: string;
  description?: string;
  status: AgendaItemStatus;
  priority: AgendaItemPriority;
  responsible_person_id?: number | null;
  default_duration?: number | null;
  /** Person who suggested the topic; null when the leadership created it. */
  proposed_by?: number | null;
  proposal_status?: AgendaItemProposalStatus | null;
  decision_note?: string | null;
  created_by?: string;
  responsible_person?: Pick<Person, 'id' | 'firstName' | 'lastName'>;
  proposer?: Pick<Person, 'id' | 'firstName' | 'lastName'>;
}

/** One appearance of a topic in a plan (result of get_agenda_item_history). */
export interface AgendaItemHistoryEntry {
  attendance_id: number;
  date: string;
  type_id: string;
  type_info: string | null;
  field_id: string;
  outcome: ProtocolOutcome | null;
  protocol_status: ProtocolStatus | null;
}

export interface Protocol {
  id?: string;
  attendance_id: number;
  /** Tiptap document per plan field id, plus PROTOCOL_GENERAL_SECTION_ID for general notes. */
  content: { [fieldId: string]: Record<string, unknown> };
  /** Result per plan field id (TOP). */
  outcomes?: { [fieldId: string]: ProtocolOutcome };
  status?: ProtocolStatus;
  published_at?: string | null;
  published_by?: string | null;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  tenant_id: number;
  attendance?: Pick<Attendance, 'id' | 'date' | 'typeInfo' | 'type_id'>;
}

export interface Task {
  id?: string;
  created_at?: string;
  updated_at?: string;
  tenant_id: number;
  title: string;
  description?: string;
  responsible_person_id?: number | null;
  priority: AgendaItemPriority;
  due_date?: string | null;
  status: TaskStatus;
  agenda_item_id?: string | null;
  protocol_id?: string | null;
  attendance_id?: number | null;
  reminder_sent?: boolean;
  overdue_reminder_sent?: boolean;
  completed_at?: string | null;
  created_by?: string;
  responsible_person?: Pick<Person, 'id' | 'firstName' | 'lastName'>;
  agenda_item?: Pick<AgendaItem, 'id' | 'title'> | null;
  attendance?: Pick<Attendance, 'id' | 'date' | 'typeInfo'> | null;
}

export interface Message {
  id: string;
  tenantId: number;
  sender_id: string;
  sender_name: string | null;
  title: string;
  body_json: Record<string, unknown>;
  body_html: string;
  body_text: string;
  channels: string[];
  group_ids: number[] | null;
  recipient_count: number;
  status: 'sending' | 'sent';
  created_at: string;
  sent_at: string | null;
}

export interface MessageRecipient {
  id: string;
  message_id: string;
  tenantId: number;
  player_id: number | null;
  user_id: string | null;
  name: string;
  group_id: number | null;
  email: string | null;
  push_enabled: boolean;
  push_sent_at: string | null;
  telegram_sent_at: string | null;
  push_failed: boolean;
  email_sent_at: string | null;
  email_delivered_at: string | null;
  email_opened_at: string | null;
  email_bounced_at: string | null;
  email_failed: boolean;
  read_at: string | null;
}

export interface MessageRecipientCounts {
  recipients: number;
  push: number;
  email: number;
  unreachable: number;
}
