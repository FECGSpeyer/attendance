import {
  Component,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, ModalController } from '@ionic/angular/lazy';
import { JSONContent } from '@tiptap/core';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import { TiptapEditorComponent } from 'src/app/shared/tiptap-editor/tiptap-editor.component';
import { DbService } from 'src/app/services/db.service';
import {
  AgendaItem,
  Attendance,
  AttendanceType,
  FieldSelection,
  PersonAttendance,
  PROTOCOL_GENERAL_SECTION_ID,
  Protocol,
  ProtocolOutcome,
  Task,
} from 'src/app/utilities/interfaces';
import { AttendanceStatus } from 'src/app/utilities/constants';
import { Utils } from 'src/app/utilities/Utils';
import {
  OUTCOME_LABELS,
  buildAgendaField,
  fieldDisplayName,
  fieldStartTimes,
  insertAgendaFields,
  isEditedAfterPublish,
  protocolSections,
  topNumbers,
} from 'src/app/team-organization/team-org.utils';
import { openTaskForm } from 'src/app/tasks/task-form/task-form.component';
import {
  LiveSection,
  PublishSummary,
  docToPlainText,
  initials,
  isDocEmpty,
  isPresentStatus,
  joinNames,
  leftoverSections,
  liveSection,
  nextSectionId,
  planStartDateTime,
  publishSummary,
  taskSections,
  TopicClosure,
  topicClosureCandidates,
  ColumnWidths,
  clampSideWidth,
  DEFAULT_COLUMN_WIDTHS,
  parseColumnWidths,
} from './protocol.helpers';
import { createProtocolPdf, ProtocolPdfData } from './protocol-pdf';
import { translate } from '@jsverse/transloco';
import { currentLanguage, dateFmt } from '../../i18n/languages';

type Doc = Record<string, unknown>;

/** One protocol section = one field of the Ablaufplan. */
export interface SectionView {
  id: string;
  field: FieldSelection;
  /** "TOP 1 · Konzertplanung" or the plain field name. */
  title: string;
  name: string;
  topNumber?: number;
  isTop: boolean;
  start?: string;
  duration: number;
  conductor?: string;
}

interface Attendee {
  id: string;
  name: string;
  initials: string;
  color: string;
  status: AttendanceStatus;
  notes?: string;
}

interface LeftoverView {
  key: string;
  title: string;
  doc: Doc;
}

const AVATAR_COLORS = ['#3b7d84', '#7b5ea7', '#c0703a', '#2f7d4f', '#a6475f', '#4a6fa5', '#8a7a2f'];
/** Width from which the three-column layout (agenda · notes · general notes) is used. */
const WIDE_QUERY = '(min-width: 900px)';
const COLUMN_WIDTHS_KEY = 'protocolColumnWidths';
const SAVE_DEBOUNCE_MS = 800;

@Component({
  selector: 'app-protocol',
  templateUrl: './protocol.page.html',
  styleUrls: ['./protocol.page.scss'],
  standalone: false,
})
export class ProtocolPage implements OnInit, OnDestroy {
  @ViewChildren(TiptapEditorComponent) editors: QueryList<TiptapEditorComponent>;

  readonly GENERAL = PROTOCOL_GENERAL_SECTION_ID;
  readonly OUTCOMES: { value: ProtocolOutcome; label: string }[] =
    (['discussed', 'decided', 'postponed'] as ProtocolOutcome[]).map(value => ({ value, label: OUTCOME_LABELS[value] }));
  readonly OUTCOME_LABELS = OUTCOME_LABELS;

  attendanceId: number;
  attendance: Attendance | null = null;
  type: AttendanceType | undefined;
  protocol: Protocol | null = null;
  private _tasks: Task[] = [];
  /** Current status per task id, so task references in the text show it live. */
  taskStatuses: Record<string, string> = {};
  get tasks(): Task[] { return this._tasks; }
  set tasks(tasks: Task[]) {
    this._tasks = tasks;
    this.taskStatuses = Object.fromEntries(tasks.filter(t => t.id).map(t => [t.id!, t.status]));
  }

  isLeader = false;
  isLoading = true;
  loadFailed = false;
  /** Member opened a protocol that RLS does not return (not published / not in the circle). */
  notAvailable = false;

  sections: SectionView[] = [];
  leftovers: LeftoverView[] = [];
  /** Latest doc per section (updated on every change, used for previews, summary and PDF). */
  docs: { [fieldId: string]: Doc } = {};
  /**
   * Content bound to the editors. Only set when an editor is (re)created, so a
   * running editor never gets its own (older) content pushed back while typing.
   */
  editorContent: { [fieldId: string]: Doc | null } = {};
  outcomes: { [fieldId: string]: ProtocolOutcome } = {};

  present: Attendee[] = [];
  excused: Attendee[] = [];
  others: Attendee[] = [];

  /** Selected section (wide layout) / expanded card (phone). */
  activeId: string | null = null;
  live: LiveSection | null = null;
  isWide = false;
  /** Side column widths of the wide layout, adjustable via the drag handles. */
  columnWidths: ColumnWidths = { ...DEFAULT_COLUMN_WIDTHS };
  resizing: 'left' | 'right' | null = null;

  savingCount = 0;
  lastSavedAt: Date | null = null;

  attendeesOpen = false;
  notesOpen = false;
  publishOpen = false;
  sendPdf = true;
  summary: PublishSummary | null = null;
  /** Open topics decided/discussed here, offered to be marked as done on publish. */
  topicClosures: TopicClosure[] = [];
  publishing = false;

  private taskSectionMap = new Map<string, string>();
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingDocs = new Map<string, Doc>();
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private mediaListener = (e: MediaQueryListEvent) => this.onLayoutChange(e.matches);
  private isActivePage = false;
  private lastErrorToast = 0;

  constructor(
    private db: DbService,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private modalController: ModalController,
    private zone: NgZone,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────

  async ngOnInit() {
    this.attendanceId = Number(this.route.snapshot.params['attendanceId'] ?? this.route.snapshot.paramMap.get('attendanceId'));
    this.isLeader = this.db.isTeamLeader();
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia(WIDE_QUERY);
      this.isWide = this.mediaQuery.matches;
      this.mediaQuery.addEventListener?.('change', this.mediaListener);
    }
    this.columnWidths = parseColumnWidths(this.readStoredWidths());
    await this.load();
  }

  ionViewDidEnter() {
    this.isActivePage = true;
  }

  async ionViewWillLeave() {
    this.isActivePage = false;
    await this.flushAll();
  }

  ngOnDestroy() {
    this.stopLiveTimer();
    this.mediaQuery?.removeEventListener?.('change', this.mediaListener);
    // Last chance: send what is still waiting in the debounce.
    void this.flushAll();
  }

  get backHref(): string {
    return this.isLeader ? `/tabs/attendance/${this.attendanceId}` : '/tabs/settings/team-organization?tab=protocols';
  }

  async load() {
    this.isLoading = true;
    this.loadFailed = false;
    try {
      const [attendance, protocol, tasks] = await Promise.all([
        this.db.getAttendanceById(this.attendanceId),
        this.db.getProtocolForAttendance(this.attendanceId),
        this.db.getTasksForAttendance(this.attendanceId).catch(() => [] as Task[]),
      ]);
      this.attendance = attendance;
      this.type = this.db.attendanceTypes().find(t => t.id === attendance?.type_id);
      this.protocol = protocol;
      this.tasks = tasks ?? [];

      if (!this.isLeader && !protocol) {
        this.notAvailable = true;
        return;
      }

      this.docs = { ...((protocol?.content ?? {}) as { [k: string]: Doc }) };
      this.outcomes = { ...(protocol?.outcomes ?? {}) };
      this.buildSections();
      this.buildAttendees();
      await this.buildLeftovers();
      this.editorContent = { ...this.docs };

      this.updateLive();
      this.activeId = this.live?.fieldId ?? this.sections[0]?.id ?? null;
      this.startLiveTimer();
    } catch (error) {
      console.error('Protocol load error:', error);
      this.loadFailed = true;
    } finally {
      this.isLoading = false;
    }
  }

  private buildSections() {
    const fields = protocolSections(this.attendance?.plan?.fields);
    const numbers = topNumbers(fields);
    const times = fieldStartTimes(this.planStart, fields);
    this.sections = fields.map(field => ({
      id: field.id,
      field,
      title: fieldDisplayName(field, numbers),
      name: field.name,
      topNumber: numbers.get(field.id),
      isTop: !!field.agendaItemId,
      start: times.get(field.id),
      duration: parseInt(field.time, 10) || 0,
      conductor: field.conductor,
    }));
    this.refreshTaskSections();
  }

  private refreshTaskSections() {
    this.taskSectionMap = taskSections(this.docs, this.tasks, this.sections.map(s => s.field));
  }

  private buildAttendees() {
    const persons: PersonAttendance[] = this.attendance?.persons ?? [];
    const toAttendee = (p: PersonAttendance, i: number): Attendee => {
      const firstName = p.person?.firstName ?? p.firstName ?? '';
      const lastName = p.person?.lastName ?? p.lastName ?? '';
      return {
        id: String(p.id ?? p.person_id),
        name: `${firstName} ${lastName}`.trim() || translate('common.unknown'),
        initials: initials(firstName, lastName),
        color: AVATAR_COLORS[(p.person_id ?? i) % AVATAR_COLORS.length],
        status: p.status,
        notes: p.notes,
      };
    };
    const all = persons.map(toAttendee).sort((a, b) => a.name.localeCompare(b.name));
    this.present = all.filter(a => isPresentStatus(a.status));
    this.excused = all.filter(a => a.status === AttendanceStatus.Excused);
    this.others = all.filter(a => !isPresentStatus(a.status) && a.status !== AttendanceStatus.Excused);
  }

  private async buildLeftovers() {
    const leftovers = leftoverSections(this.docs, this.sections.map(s => s.id));
    const agendaIds = leftovers.map(l => l.agendaItemId).filter((id): id is string => !!id);
    let items: AgendaItem[] = [];
    if (agendaIds.length) {
      try {
        items = await this.db.getAgendaItemsByIds(agendaIds);
      } catch {
        items = [];
      }
    }
    this.leftovers = leftovers.map(l => ({
      key: l.key,
      doc: l.doc,
      title: l.agendaItemId
        ? (items.find(i => i.id === l.agendaItemId)?.title ?? translate('protocol.agendaItem'))
        : translate('protocol.earlierItem'),
    }));
  }

  // ── Display helpers ──────────────────────────────────────

  /** Plan start: plan time, otherwise the start time of the Termin. */
  get planStart(): string | undefined {
    return this.attendance?.plan?.time || this.attendance?.start_time || this.type?.start_time || undefined;
  }

  get title(): string {
    return this.attendance?.typeInfo || this.type?.name || translate('protocol.title');
  }

  get dateLabel(): string {
    if (!this.attendance?.date) return '';
    return dayjs(this.attendance.date).locale(currentLanguage()).format(`dd, ${dateFmt()}`);
  }

  get shortDate(): string {
    return this.attendance?.date ? dayjs(this.attendance.date).format(dateFmt('dayMonth')) : '';
  }

  get timeRange(): string {
    const start = planStartDateTime(this.attendance?.date, this.planStart);
    if (!start) return '';
    const total = this.sections.reduce((sum, s) => sum + s.duration, 0);
    return total ? `${start.format('HH:mm')}–${start.add(total, 'minute').format('HH:mm')}` : start.format('HH:mm');
  }

  /** Phone layout for leaders: save state and publish button sit in a footer. */
  get showFooter(): boolean {
    return this.isLeader && !this.isWide && !!this.attendance && !this.notAvailable && !this.isLoading && !this.loadFailed;
  }

  get isPublished(): boolean {
    return this.protocol?.status === 'published';
  }

  get statusLine(): string {
    if (!this.isPublished) return translate('teamOrg.draft');
    const published = this.protocol?.published_at ? dayjs(this.protocol.published_at).format(dateFmt()) : '';
    let line = translate('teamOrg.publishedOn', { date: published });
    if (isEditedAfterPublish(this.protocol)) {
      line = translate('teamOrg.editedOn', { text: line, date: dayjs(this.protocol!.updated_at).format(dateFmt()) });
    }
    return line;
  }

  get saveLabel(): string {
    if (this.savingCount > 0) return translate('protocol.saving');
    if (this.lastSavedAt) return translate('protocol.autoSavedAt', { time: dayjs(this.lastSavedAt).format('HH:mm') });
    return this.isPublished ? translate('protocol.changesAutoSaved') : translate('protocol.autoSaved');
  }

  get activeSection(): SectionView | undefined {
    return this.sections.find(s => s.id === this.activeId);
  }

  get activeLeftover(): LeftoverView | undefined {
    return this.leftovers.find(l => l.key === this.activeId);
  }

  get liveSectionView(): SectionView | undefined {
    return this.live ? this.sections.find(s => s.id === this.live!.fieldId) : undefined;
  }

  get liveLabel(): string {
    const s = this.liveSectionView;
    if (!s || !this.live) return '';
    const name = s.topNumber ? translate('protocol.top', { n: s.topNumber }) : s.name;
    return translate('protocol.running', { name, min: this.live.remainingMinutes });
  }

  get hasNext(): boolean {
    return !!nextSectionId(this.sections, this.activeId);
  }

  /** Avatars in the attendee row: up to four initials plus "+n". */
  get avatarPreview(): { list: Attendee[]; more: number } {
    return { list: this.present.slice(0, 4), more: Math.max(0, this.present.length - 4) };
  }

  hasNotes(id: string): boolean {
    return !isDocEmpty(this.docs[id]);
  }

  preview(id: string): string {
    return docToPlainText(this.docs[id], 140);
  }

  sectionMeta(s: SectionView): string {
    return [s.start, s.duration ? translate('planning.minShort', { min: s.duration }) : '', s.conductor].filter(Boolean).join(' · ');
  }

  tasksFor(sectionId: string): Task[] {
    return this.tasks.filter(t => t.id && this.taskSectionMap.get(t.id) === sectionId);
  }

  /** Tasks of this Termin that belong to no section in the plan. */
  get unassignedTasks(): Task[] {
    const ids = new Set(this.sections.map(s => s.id));
    return this.tasks.filter(t => !t.id || !ids.has(this.taskSectionMap.get(t.id) ?? ''));
  }

  sectionLabelOfTask(task: Task): string {
    const id = task.id ? this.taskSectionMap.get(task.id) : undefined;
    const s = this.sections.find(x => x.id === id);
    if (s) return s.topNumber ? translate('protocol.top', { n: s.topNumber }) : s.name;
    return id === PROTOCOL_GENERAL_SECTION_ID ? translate('protocol.general') : '';
  }

  taskLine(task: Task): string {
    const parts: string[] = [];
    if (task.responsible_person) parts.push(`${task.responsible_person.firstName} ${task.responsible_person.lastName}`.trim());
    if (task.due_date) parts.push(translate('protocol.dueShort', { date: dayjs(task.due_date).format(dateFmt('dayMonth')) }));
    return parts.join(' · ');
  }

  outcomeColor(outcome: ProtocolOutcome | undefined): string {
    switch (outcome) {
      case 'decided': return 'success';
      case 'postponed': return 'warning';
      case 'discussed': return 'primary';
      default: return 'medium';
    }
  }

  trackById(_: number, s: { id: string }) {
    return s.id;
  }

  // ── Layout / navigation ──────────────────────────────────

  private onLayoutChange(wide: boolean) {
    // Editors are recreated in the other layout: send pending text first and
    // hand the new editors the latest content.
    this.captureEditors();
    this.editorContent = { ...this.docs };
    this.isWide = wide;
    if (wide) this.notesOpen = false;
  }

  /** Phone: expand/collapse a card. Wide: select the section. */
  toggleSection(id: string) {
    if (this.activeId === id) {
      if (this.isWide) return;
      this.captureEditor(id);
      this.activeId = null;
      return;
    }
    this.activate(id);
  }

  activate(id: string, focus = false) {
    if (this.activeId) this.captureEditor(this.activeId);
    this.editorContent = { ...this.editorContent, [id]: this.docs[id] ?? null };
    this.activeId = id;
    setTimeout(() => {
      const el = document.getElementById(`protocol-section-${id}`);
      if (!this.isWide) el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (focus) {
        (document.querySelector(`[data-editor-section="${id}"] .ProseMirror`) as HTMLElement | null)?.focus();
      }
    }, 80);
  }

  nextSection() {
    const next = nextSectionId(this.sections, this.activeId);
    if (next) this.activate(next, true);
  }

  previousSection() {
    const i = this.sections.findIndex(s => s.id === this.activeId);
    if (i > 0) this.activate(this.sections[i - 1].id, true);
  }

  // ── Resizable columns (wide layout) ──────────────────────

  get gridColumns(): string {
    return `${this.columnWidths.left}px 8px minmax(0, 1fr) 8px ${this.columnWidths.right}px`;
  }

  /**
   * Dragging runs outside Angular and writes the grid template directly, so the
   * columns follow the pointer on every frame; state is synced on release.
   */
  startResize(side: 'left' | 'right', event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const grid = handle.parentElement;
    if (!grid) return;
    this.resizing = side;
    const startX = event.clientX;
    const startWidth = this.columnWidths[side];
    let frame = 0;
    let lastX = startX;

    const apply = () => {
      frame = 0;
      const delta = lastX - startX;
      this.setWidth(side, startWidth + (side === 'left' ? delta : -delta), grid.clientWidth);
      grid.style.gridTemplateColumns = this.gridColumns;
    };
    const move = (e: PointerEvent) => {
      lastX = e.clientX;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (frame) cancelAnimationFrame(frame);
      apply();
      this.zone.run(() => {
        this.resizing = null;
        this.storeWidths();
      });
    };
    this.zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
  }

  /** Arrow keys move the focused handle; Home/double-click resets. */
  resizeByKey(side: 'left' | 'right', event: KeyboardEvent) {
    const container = (event.currentTarget as HTMLElement).parentElement?.clientWidth ?? 0;
    const step = event.shiftKey ? 48 : 16;
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    if (event.key === grow) this.setWidth(side, this.columnWidths[side] + step, container);
    else if (event.key === shrink) this.setWidth(side, this.columnWidths[side] - step, container);
    else if (event.key === 'Home') this.resetWidth(side);
    else return;
    event.preventDefault();
    event.stopPropagation();
    this.storeWidths();
  }

  resetWidth(side: 'left' | 'right') {
    this.columnWidths = { ...this.columnWidths, [side]: DEFAULT_COLUMN_WIDTHS[side] };
    this.storeWidths();
  }

  private setWidth(side: 'left' | 'right', width: number, container: number) {
    const other = side === 'left' ? this.columnWidths.right : this.columnWidths.left;
    this.columnWidths = { ...this.columnWidths, [side]: clampSideWidth(width, other, container) };
  }

  private readStoredWidths(): string | null {
    try { return localStorage.getItem(COLUMN_WIDTHS_KEY); } catch { return null; }
  }

  private storeWidths() {
    try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(this.columnWidths)); } catch { /* ignore */ }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!this.isActivePage || !this.isWide || !this.isLeader) return;
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.nextSection();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.previousSection();
    }
  }

  // ── Live mode ────────────────────────────────────────────

  private updateLive() {
    const start = planStartDateTime(this.attendance?.date, this.planStart);
    this.live = liveSection(this.sections.map(s => s.field), start, new Date());
  }

  private startLiveTimer() {
    this.stopLiveTimer();
    if (!this.isLeader || !this.attendance?.date || !dayjs(this.attendance.date).isSame(dayjs(), 'day')) return;
    this.liveTimer = setInterval(() => this.updateLive(), 20000);
  }

  private stopLiveTimer() {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.liveTimer = null;
  }

  // ── Saving ───────────────────────────────────────────────

  onSectionChange(fieldId: string, content: JSONContent) {
    const doc = content as Doc;
    this.docs = { ...this.docs, [fieldId]: doc };
    this.queueSave(fieldId, doc);
    this.refreshTaskSections();
  }

  private queueSave(fieldId: string, doc: Doc) {
    this.pendingDocs.set(fieldId, doc);
    const timer = this.saveTimers.get(fieldId);
    if (timer) clearTimeout(timer);
    this.saveTimers.set(fieldId, setTimeout(() => void this.flushSection(fieldId), SAVE_DEBOUNCE_MS));
  }

  private async flushSection(fieldId: string) {
    const timer = this.saveTimers.get(fieldId);
    if (timer) clearTimeout(timer);
    this.saveTimers.delete(fieldId);
    const doc = this.pendingDocs.get(fieldId);
    if (!doc) return;
    this.pendingDocs.delete(fieldId);
    this.savingCount++;
    try {
      const row = await this.db.saveProtocolSection(this.attendanceId, fieldId, { doc });
      this.applyRow(row);
      this.lastSavedAt = new Date();
    } catch (error) {
      console.error('Protocol save error:', error);
      // Keep the text for the next attempt unless newer text is already waiting.
      if (!this.pendingDocs.has(fieldId)) this.pendingDocs.set(fieldId, doc);
      this.showSaveError();
    } finally {
      this.savingCount--;
    }
  }

  private showSaveError() {
    if (Date.now() - this.lastErrorToast < 10000) return;
    this.lastErrorToast = Date.now();
    Utils.showToast(translate('protocol.notesSaveFailed'), 'danger');
  }

  /**
   * Takes over notes and results others saved in the meantime, for every
   * section without an unsaved local change (used before summary, PDF and publish).
   */
  private mergeServerRow(row: Protocol | null | undefined) {
    if (!row) return;
    const docs = { ...this.docs };
    const changed: Record<string, Doc | null> = {};
    for (const [id, doc] of Object.entries(row.content ?? {})) {
      if (this.pendingDocs.has(id) || this.getEditor(id)?.hasPendingChange) continue;
      if (JSON.stringify(doc) !== JSON.stringify(docs[id] ?? null)) {
        docs[id] = doc as Doc;
        changed[id] = doc as Doc;
      }
    }
    this.docs = docs;
    if (Object.keys(changed).length) this.editorContent = { ...this.editorContent, ...changed };
    this.outcomes = { ...(row.outcomes ?? {}) };
  }

  /** Takes over the meta data of the saved row; local notes and results stay as they are. */
  private applyRow(row: Protocol | null | undefined) {
    if (!row) return;
    this.protocol = {
      ...(this.protocol ?? row),
      id: row.id,
      status: row.status,
      published_at: row.published_at,
      published_by: row.published_by,
      updated_at: row.updated_at,
      content: this.docs,
      outcomes: this.outcomes,
    };
  }

  /**
   * Takes a change the user made but the editor hasn't emitted yet (its own
   * debounce) into the save queue. Editors that were only shown are never
   * saved, so opening a protocol can't overwrite someone else's notes.
   */
  private captureEditor(fieldId: string) {
    const editor = this.getEditor(fieldId);
    if (!editor || !this.isLeader) return;
    let json: Doc | null = null;
    try {
      json = editor.takePendingChange() as Doc | null;
    } catch {
      json = null; // editor already destroyed
    }
    if (!json) return;
    this.docs = { ...this.docs, [fieldId]: json };
    this.queueSave(fieldId, json);
  }

  private captureEditors() {
    this.editors?.forEach(e => e.sectionId && this.captureEditor(e.sectionId));
  }

  /** Saves everything that is still waiting, right now. */
  async flushAll() {
    if (!this.isLeader) return;
    this.captureEditors();
    await Promise.all([...this.pendingDocs.keys()].map(id => this.flushSection(id)));
  }

  async setOutcome(fieldId: string, outcome: ProtocolOutcome) {
    const previous = this.outcomes[fieldId];
    const next = previous === outcome ? null : outcome;
    const outcomes = { ...this.outcomes };
    if (next) outcomes[fieldId] = next;
    else delete outcomes[fieldId];
    this.outcomes = outcomes;
    this.savingCount++;
    try {
      const row = await this.db.saveProtocolSection(this.attendanceId, fieldId, { outcome: next });
      this.applyRow(row);
      this.lastSavedAt = new Date();
    } catch (error) {
      console.error('Outcome save error:', error);
      const reverted = { ...this.outcomes };
      if (previous) reverted[fieldId] = previous;
      else delete reverted[fieldId];
      this.outcomes = reverted;
      Utils.showToast(translate('protocol.outcomeSaveFailed'), 'danger');
    } finally {
      this.savingCount--;
    }
  }

  private getEditor(sectionId: string): TiptapEditorComponent | undefined {
    return this.editors?.find(e => e.sectionId === sectionId);
  }

  /** Tasks need the protocol id; saving an empty change creates the protocol row. */
  private async ensureProtocol(): Promise<string | null> {
    if (this.protocol?.id) return this.protocol.id;
    const row = await this.db.saveProtocolSection(this.attendanceId, PROTOCOL_GENERAL_SECTION_ID, {});
    this.applyRow(row);
    return row?.id ?? null;
  }

  // ── Tasks ────────────────────────────────────────────────

  async createTask(sectionId: string) {
    const section = this.sections.find(s => s.id === sectionId);
    let protocolId: string | null = null;
    try {
      protocolId = await this.ensureProtocol();
    } catch (error) {
      console.error('Protocol create error:', error);
      Utils.showToast(translate('protocol.createFailed'), 'danger');
      return;
    }
    const task = await openTaskForm(this.modalController, {
      attendanceId: this.attendanceId,
      protocolId,
      agendaItemId: section?.field.agendaItemId ?? null,
      contextLabel: section ? section.title : translate('protocol.generalNotes'),
    });
    if (!task?.id) return;

    this.getEditor(sectionId)?.insertTaskRef({ id: task.id, title: task.title, status: task.status });
    this.tasks = [...this.tasks.filter(t => t.id !== task.id), task];
    this.taskSectionMap.set(task.id, sectionId);
    // Reload to get the joined person; the section mapping above stays until the editor change arrives.
    try {
      const tasks = await this.db.getTasksForAttendance(this.attendanceId);
      if (tasks?.length) this.tasks = tasks;
    } catch {
      // keep the local list
    }
    // The editor emits the new doc with its own debounce; capture it now so the reference is saved.
    setTimeout(() => {
      this.captureEditor(sectionId);
      this.refreshTaskSections();
      this.taskSectionMap.set(task.id!, sectionId);
    }, 50);
  }

  // ── Spontaneous topic ────────────────────────────────────

  async addSpontaneousTopic() {
    const defaultDuration = this.type?.agenda_default_duration || 10;
    const alert = await this.alertController.create({
      header: translate('protocol.spontaneous'),
      message: translate('protocol.spontaneousHint'),
      inputs: [
        { name: 'title', type: 'text', placeholder: translate('tasks.title') },
        { name: 'duration', type: 'number', placeholder: translate('protocol.durationMinutes'), value: defaultDuration, min: 1 },
      ],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('protocol.add'),
          handler: (data: { title?: string; duration?: string }) => {
            const title = data.title?.trim();
            if (!title) {
              Utils.showToast(translate('agenda.enterTitle'), 'warning');
              return false;
            }
            const duration = Math.max(1, parseInt(data.duration ?? '', 10) || defaultDuration);
            void this.insertSpontaneousTopic(title, duration);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async insertSpontaneousTopic(title: string, duration: number) {
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      const item = await this.db.addAgendaItem({
        title,
        status: 'open',
        priority: 'medium',
        tenant_id: this.db.tenant().id,
        default_duration: duration,
      });
      // Use the latest plan so changes made elsewhere in the meantime are kept.
      let current = this.attendance!;
      try {
        current = await this.db.getAttendanceById(this.attendanceId);
      } catch {
        // fall back to the loaded plan
      }
      const plan = current.plan ?? this.attendance?.plan ?? {
        time: this.planStart ?? dayjs().format('HH:mm'),
        end: current.end_time ?? '',
        fields: [],
      };
      const field = buildAgendaField(item, duration);
      const fields = insertAgendaFields(plan.fields ?? [], [field]);
      const updated = await this.db.updateAttendance({ plan: { ...plan, fields } }, this.attendanceId);
      this.attendance = { ...this.attendance!, plan: updated?.plan ?? { ...plan, fields } };
      this.captureEditors();
      this.buildSections();
      this.updateLive();
      this.activate(field.id, true);
    } catch (error) {
      console.error('Spontaneous topic error:', error);
      Utils.showToast(translate('protocol.pointFailed'), 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  // ── Notes sheet (phone) ──────────────────────────────────

  openNotes() {
    this.editorContent = { ...this.editorContent, [PROTOCOL_GENERAL_SECTION_ID]: this.docs[PROTOCOL_GENERAL_SECTION_ID] ?? null };
    this.notesOpen = true;
  }

  closeNotes() {
    this.captureEditor(PROTOCOL_GENERAL_SECTION_ID);
    this.notesOpen = false;
  }

  // ── Publish ──────────────────────────────────────────────

  async openPublish() {
    await this.flushAll();
    // Other leaders may have written in other sections meanwhile.
    try {
      this.mergeServerRow(await this.db.getProtocolForAttendance(this.attendanceId));
    } catch (error) {
      console.error('Protocol reload error:', error);
    }
    this.summary = publishSummary(
      this.sections.map(s => ({ id: s.id, name: s.name, isTop: s.isTop })),
      { content: this.docs, outcomes: this.outcomes },
      this.tasks,
      this.present.length,
    );
    this.topicClosures = [];
    const agendaIds = this.sections.map(s => s.field.agendaItemId).filter((id): id is string => !!id);
    if (agendaIds.length) {
      try {
        const items = await this.db.getAgendaItemsByIds(agendaIds);
        this.topicClosures = topicClosureCandidates(
          this.sections.map(s => ({ id: s.id, name: s.name, agendaItemId: s.field.agendaItemId })),
          this.outcomes,
          items,
        );
      } catch (error) {
        console.error('Agenda item load error:', error);
      }
    }
    this.publishOpen = true;
  }

  joinNames(names: string[]): string {
    return joinNames(names);
  }

  async publish() {
    if (this.publishing) return;
    this.publishing = true;
    const loading = await Utils.getLoadingElement(99999);
    await loading.present();
    try {
      await this.flushAll();
      const row = await this.db.publishProtocol(this.attendanceId);
      this.mergeServerRow(row);
      this.applyRow(row);
      await this.closeTopics();

      let pdfUrl: string | undefined;
      let pdfPath: string | undefined;
      if (this.sendPdf) {
        try {
          const blob = await createProtocolPdf(await this.buildPdfData());
          const upload = await this.db.protocolSvc.uploadPdf(this.attendanceId, blob);
          pdfUrl = upload.url;
          pdfPath = upload.path;
        } catch (error) {
          console.error('Protocol PDF error:', error);
          Utils.showToast(translate('protocol.pdfFailedNotify'), 'warning');
        }
      }

      await this.db.notifyTeam({ type: 'protocol_published', attendanceId: this.attendanceId, ...(pdfUrl ? { pdfUrl } : {}) });
      if (pdfPath) {
        const path = pdfPath;
        // The edge function fetches the file right away; remove it afterwards.
        setTimeout(() => void this.db.protocolSvc.removePdf(path).catch(() => undefined), 60000);
      }
      this.publishOpen = false;
      Utils.showToast(translate('protocol.published'), 'success');
    } catch (error) {
      console.error('Publish error:', error);
      Utils.showToast(translate('protocol.publishFailed'), 'danger');
    } finally {
      this.publishing = false;
      await loading.dismiss();
    }
  }

  /** Marks the selected topics as done; a failure does not stop the publish. */
  private async closeTopics() {
    const selected = this.topicClosures.filter(t => t.close);
    const results = await Promise.allSettled(
      selected.map(t => this.db.updateAgendaItem(t.agendaItemId, { status: 'completed' })),
    );
    if (results.some(r => r.status === 'rejected')) {
      console.error('Topic close error:', results);
      Utils.showToast(translate('protocol.closeFailed'), 'warning');
    }
  }

  // ── PDF ──────────────────────────────────────────────────

  private async buildPdfData(): Promise<ProtocolPdfData> {
    let branding: ProtocolPdfData['branding'];
    try {
      branding = await Utils.buildTenantBranding(this.db.getBrandingSource());
    } catch {
      branding = undefined;
    }
    const taskText = (t: Task) => {
      const parts = [t.title];
      if (t.responsible_person) parts.push(`${t.responsible_person.firstName} ${t.responsible_person.lastName}`.trim());
      if (t.due_date) parts.push(translate('protocol.dueShort', { date: dayjs(t.due_date).format(dateFmt()) }));
      if (t.status === 'completed') parts.push('erledigt');
      return parts.join(' · ');
    };
    const sections = this.sections.map(s => ({
      title: s.title,
      meta: this.sectionMeta(s),
      outcome: this.outcomes[s.id] ? OUTCOME_LABELS[this.outcomes[s.id]] : undefined,
      doc: this.docs[s.id] ?? null,
      tasks: this.tasksFor(s.id).map(taskText),
    }));
    for (const l of this.leftovers) {
      sections.push({ title: translate('protocol.moreNotesTitle', { title: l.title }), meta: '', outcome: undefined, doc: l.doc, tasks: this.tasksFor(l.key).map(taskText) });
    }
    const general = this.tasksFor(PROTOCOL_GENERAL_SECTION_ID);
    const leftoverKeys = new Set(this.leftovers.map(l => l.key));
    const other = this.tasks.filter(t => {
      const id = t.id ? this.taskSectionMap.get(t.id) : undefined;
      return !id || (!this.sections.some(s => s.id === id) && !leftoverKeys.has(id));
    });
    return {
      title: translate('protocol.pdfTitle', { title: this.title }),
      subtitle: [this.dateLabel, this.timeRange ? translate('attendance.timeOClock', { time: this.timeRange }) : ''].filter(Boolean).join(' · '),
      status: this.statusLine,
      present: this.present.map(a => a.name),
      excused: this.excused.map(a => a.name),
      sections,
      generalNotes: this.docs[PROTOCOL_GENERAL_SECTION_ID] ?? null,
      otherTasks: [...new Set([...general, ...other])].map(taskText),
      branding,
    };
  }

  async sharePdf() {
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      await this.flushAll();
      const blob = await createProtocolPdf(await this.buildPdfData());
      const date = this.attendance?.date ? dayjs(this.attendance.date).format('YYYY-MM-DD') : '';
      const name = translate('protocol.fileName', { title: this.title, date }).trim().replace(/[\\/:*?"<>|]+/g, '-');
      await loading.dismiss();
      await Utils.downloadFileNative(blob, `${name}.pdf`);
    } catch (error) {
      console.error('Protocol PDF error:', error);
      await loading.dismiss();
      Utils.showToast(translate('protocol.pdfFailed'), 'danger');
    }
  }
}
