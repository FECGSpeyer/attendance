import { dateFmt } from '../i18n/languages';
import { Component, Input, OnInit } from '@angular/core';
import { ActionSheetButton, ActionSheetController, AlertController, AlertInput, IonItemSliding, IonModal, IonPopover, ItemReorderEventDetail, ModalController } from '@ionic/angular/lazy';
import { Capacitor } from '@capacitor/core';
import dayjs from 'dayjs';
import { DbService } from '../services/db.service';
import { Attendance, FieldSelection, GroupCategory, History, Group, Person, Plan, Song, AttendanceType, PlanBlockTemplate } from '../utilities/interfaces';
// jsPDF is lazy-loaded for better initial bundle size
import { Utils } from '../utilities/Utils';
import { DefaultAttendanceType, Role } from 'src/app/utilities/constants';
import { AGENDA_ITEMS_PLACEHOLDER_ID } from '../utilities/interfaces';
import { fieldDisplayName, topNumbers } from '../team-organization/team-org.utils';
import { AgendaPickerComponent } from '../agenda-items/agenda-picker/agenda-picker.component';
import { allPlans, dayOptions, isMultiDay, nextFreeDay, planDay, planLabel, planSubtitle, splitPlans } from '../utilities/plan-days';
import { blockTemplateFrom, childrenOf, cloneBlock, groupDuration, isGroupHead, lastIndexOfGroup, moveRow, newGroupHead, normalizeGroups } from '../utilities/plan-groups';
import { translate } from '@jsverse/transloco';

/** A row of the editor list: a field, or the "Unterpunkt hinzufügen" row closing an open block. */
interface PlanRow {
  key: string;
  field?: FieldSelection;
  /** Index of `field` in selectedFields. */
  index: number;
  /** Set on the add row of a block. */
  addFor?: FieldSelection;
}

@Component({
  selector: 'app-planning',
  templateUrl: './planning.page.html',
  styleUrls: ['./planning.page.scss'],
  standalone: false
})
export class PlanningPage implements OnInit {
  @Input() attendanceId?: number;
  /** Plan to open first when the Termin has several (e.g. the day shown on the Terminseite). */
  @Input() initialPlanIndex = 0;
  public type = 'pdf';
  public songs: Song[] = [];
  public history: History[] = [];
  public selectedFields: FieldSelection[] = [{
    id: '',
    name: translate('planning.defaultWord'),
    time: '10',
  }];
  public attendances: Attendance[] = [];
  public attendance: number;
  public time: string = dayjs().utc().hour(17).minute(50).format('YYYY-MM-DDTHH:mm');
  public end: string;
  public notes = '';
  public hasChatId = false;
  public isPlanModalOpen = false;
  public conductors: Person[] = [];
  public selConductors: number[] = [];
  public planGroups: string[] = [];
  public planConductors: string[] = [];
  public groupCategories: GroupCategory[];
  public sharePlan = false;
  public isOrgPlan = false;
  public planTitle = '';
  public isGeneral = false;
  public includeBranding = true;
  public songSearchTerm = '';
  public filteredSongs: Song[] = [];
  public isSongSelectorOpen = false;
  /** Which of the Termin's Ablaufpläne is open (0 = attendance.plan). */
  public planIndex = 0;

  readonly AGENDA_ITEMS_PLACEHOLDER_ID = AGENDA_ITEMS_PLACEHOLDER_ID;

  /** Programmblöcke folded in the editor (UI state only). */
  private collapsedGroups = new Set<string>();
  private rowsCache: PlanRow[] = [];
  private rowsKey = '';

  /** Rows shown in the editor; Unterpunkte of folded blocks are hidden. Cached for stable change detection. */
  get rows(): PlanRow[] {
    const fields = this.selectedFields;
    const key = fields.map(f => `${f.id}|${f.groupId ?? ''}|${f.isGroup ? 1 : 0}`).join(';') + '#' + [...this.collapsedGroups].join(';');
    if (key === this.rowsKey && this.rowsCache.length) { return this.rowsCache; }
    const rows: PlanRow[] = [];
    const seen = new Map<string, number>();
    const rowKey = (id: string) => {
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      return n > 1 ? `${id}#${n}` : id;
    };
    fields.forEach((field, index) => {
      if (field.groupId && this.collapsedGroups.has(field.groupId)) { return; }
      rows.push({ key: rowKey(field.id), field, index });
      const closesBlock = isGroupHead(field) ? !fields[index + 1]?.groupId : (!!field.groupId && fields[index + 1]?.groupId !== field.groupId);
      const head = isGroupHead(field) ? field : fields.find(f => f.id === field.groupId);
      if (closesBlock && head && !this.collapsedGroups.has(head.id)) {
        rows.push({ key: `add-${head.id}`, index: -1, addFor: head });
      }
    });
    this.rowsKey = key;
    this.rowsCache = rows;
    return rows;
  }

  get isAdmin(): boolean {
    return this.db.tenantUser()?.role === Role.ADMIN;
  }

  get blockTemplates(): PlanBlockTemplate[] {
    return this.db.tenant()?.plan_block_templates ?? [];
  }

  isCollapsed(head: FieldSelection): boolean {
    return this.collapsedGroups.has(head.id);
  }

  toggleGroup(head: FieldSelection) {
    if (this.collapsedGroups.has(head.id)) {
      this.collapsedGroups.delete(head.id);
    } else {
      this.collapsedGroups.add(head.id);
    }
  }

  groupMinutes(head: FieldSelection): number {
    return groupDuration(this.selectedFields, head.id);
  }

  templateMinutes(tpl: PlanBlockTemplate): number {
    const head = tpl.fields.find(isGroupHead);
    return head ? groupDuration(tpl.fields, head.id) : 0;
  }

  /** "10:37 – 10:55" for a block head. */
  groupRange(head: FieldSelection, index: number): string {
    const start = this.startOf(index);
    return `${start.format('HH:mm')} – ${start.add(this.groupMinutes(head), 'minute').format('HH:mm')}`;
  }

  private startOf(index: number): dayjs.Dayjs {
    let minutes = 0;
    for (let i = 0; i < index; i++) {
      minutes += Number(this.selectedFields[i].time) || 0;
    }
    const time: dayjs.Dayjs = dayjs(this.time).isValid() ? dayjs(this.time) : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    return time.add(minutes, 'minute');
  }

  /** "TOP n · Titel" for agenda fields, plain name otherwise. */
  fieldName(field: FieldSelection): string {
    return fieldDisplayName(field, topNumbers(this.selectedFields));
  }

  get canAddTopics(): boolean {
    // Topics (TOPs) only live in the first plan.
    return !!this.attendance && this.planIndex === 0 && this.currentAttTypeHasProtocol && this.db.isTeamLeader();
  }

  /** Opens "Themen aufnehmen" for the selected Termin and takes over the saved plan. */
  async openAgendaPicker() {
    const att = this.attendances.find(a => a.id === this.attendance);
    if (!att) return;
    // Persist what's on screen first, so the picker inserts into the current plan.
    if (this.validate(false)) {
      await this.updateAttendance();
    }
    const type = this.db.attendanceTypes().find((t: AttendanceType) => t.id === att.type_id);
    const modal = await this.modalController.create({
      component: AgendaPickerComponent,
      componentProps: {
        attendance: { ...att, plan: this.selectedFields.length ? { time: this.time, end: this.end, fields: this.selectedFields, title: this.planTitle?.trim() || undefined } : att.plan },
        type,
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'saved' && data?.plan) {
      att.plan = data.plan;
      this.time = data.plan.time;
      this.end = data.plan.end;
      this.selectedFields = data.plan.fields.map((f: FieldSelection) => ({ ...f }));
    }
  }

  get currentAttTypeHasProtocol(): boolean {
    const att = this.attendances.find(a => a.id === this.attendance);
    if (!att) return false;
    return this.db.attendanceTypes().find(t => t.id === att.type_id)?.enable_protocol ?? false;
  }

  get hasAgendaPlaceholder(): boolean {
    return this.selectedFields.some(f => f.id === AGENDA_ITEMS_PLACEHOLDER_ID);
  }

  private get currentAtt(): Attendance | undefined {
    return this.attendances.find((att: Attendance) => att.id === this.attendance);
  }

  private planLabelsCache: string[] = [];

  /** Chip labels; only shown once a Termin has more than one plan. Cached so change detection sees a stable array. */
  get planLabels(): string[] {
    const att = this.currentAtt;
    const plans = allPlans(att);
    const next = plans.map((_, i) => planLabel(att, i, plans));
    if (next.join('|') !== this.planLabelsCache.join('|')) {
      this.planLabelsCache = next;
    }
    return this.planLabelsCache;
  }

  constructor(
    private modalController: ModalController,
    public db: DbService,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
  ) { }

  // TrackBy function for reorderable fields list
  trackByFieldId = (_: number, field: FieldSelection): string => field.id;

  async ngOnInit() {
    this.isGeneral = this.db.tenant().type === 'general';
    this.songs = await this.db.getSongs();
    this.filteredSongs = [...this.songs];
    this.groupCategories = await this.db.getGroupCategories();
    this.conductors = (await this.db.getConductors()).filter((con: Person) => !con.left);
    this.selConductors = this.conductors.filter((con: Person) => Boolean(!con.left)).map((c: Person): number => c.id);
    this.hasChatId = Boolean(this.db.tenantUser().telegram_chat_id);
    this.history = await this.db.getUpcomingHistory();
    this.attendances = await this.db.getAttendance();
    const upcomingAttendances: Attendance[] = await this.db.getUpcomingAttendances();
    this.planIndex = 0;
    if (this.attendanceId) {
      this.attendance = this.attendanceId;
      const att = this.attendances.find((att: Attendance) => att.id === this.attendanceId);
      this.notes = att?.notes || '';
      this.sharePlan = att?.share_plan || false;
      this.isOrgPlan = this.resolveOrgPlan(att);
      this.planTitle = att?.plan?.title ?? this.getDefaultPlanTitle(att);
      if (att?.plan) {
        this.end = att.plan.end;
        this.time = att.plan.time;
        this.selectedFields = att.plan.fields.map((field: FieldSelection) => ({
            ...field,
            conductor: field.conductor || (this.history?.find((his: History) => his.songId === Number(field.id))?.conductorName || ''),
            // The agenda marker takes no time (older plans stored 30 min on it).
            ...(field.id === AGENDA_ITEMS_PLACEHOLDER_ID ? { time: '0' } : {}),
          }));
      } else {
        const isPractice = att?.type === 'uebung';
        this.time = att?.start_time || (isPractice ? (this.db.tenant().practiceStart || '17:50') : '10:00');
      }
    } else if (upcomingAttendances.length) {
      this.attendance = upcomingAttendances[0].id;
      this.notes = upcomingAttendances[0].notes;
      this.sharePlan = upcomingAttendances[0].share_plan || false;
      this.isOrgPlan = this.resolveOrgPlan(upcomingAttendances[0]);
      this.planTitle = upcomingAttendances[0].plan?.title ?? this.getDefaultPlanTitle(upcomingAttendances[0]);
      if (upcomingAttendances[0].plan) {
        this.end = upcomingAttendances[0].plan.end;
        this.time = upcomingAttendances[0].plan.time;
        this.selectedFields = upcomingAttendances[0].plan.fields.map((field: FieldSelection) => ({
            ...field,
            conductor: field.conductor || (this.history?.find((his: History) => his.songId === Number(field.id))?.conductorName || ''),
            // The agenda marker takes no time (older plans stored 30 min on it).
            ...(field.id === AGENDA_ITEMS_PLACEHOLDER_ID ? { time: '0' } : {}),
          }));
      } else {
        const upcomingAtt = upcomingAttendances[0];
        const isPractice = upcomingAtt.type === 'uebung';
        this.time = upcomingAtt.start_time || (isPractice ? (this.db.tenant().practiceStart || '17:50') : '10:00');
      }
    }

    if (this.history.length && this.selectedFields.length === 1) {
      this.onAttChange();
    }

    const initialAtt = this.currentAtt;
    const initialPlan = this.attendanceId && this.initialPlanIndex > 0 ? allPlans(initialAtt)[this.initialPlanIndex] : undefined;
    if (initialAtt && initialPlan) {
      this.planIndex = this.initialPlanIndex;
      this.loadPlan(initialAtt, initialPlan);
    }
  }

  calculateTime(field: FieldSelection, index: number) {
    let minutesToAdd = 0;
    let currentIndex = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.selectedFields[currentIndex].time);
      currentIndex++;
    }

    const time: dayjs.Dayjs = dayjs(this.time).isValid() ? dayjs(this.time) : dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    return `${time.add(minutesToAdd, 'minute').format('HH:mm')} ${field.conductor ? `| ${field.conductor}` : ''}`;
  }

  async changeField(field: FieldSelection, slider?: IonItemSliding) {
    slider?.close();
    const clone: FieldSelection = JSON.parse(JSON.stringify(field));
    let inputs: AlertInput[] = [{
      type: 'textarea',
      label: translate('planning.item'),
      name: 'field',
      value: clone.name,
      placeholder: translate('planning.enterItem')
    }, {
      type: 'textarea',
      label: translate('planning.performer'),
      name: 'conductor',
      value: clone.conductor,
      placeholder: translate('planning.enterPerformer')
    }, {
      type: 'textarea',
      label: translate('planning.info'),
      name: 'info',
      value: clone.info,
      placeholder: translate('planning.infoOptionalEllipsis')
    }, {
      type: 'number',
      label: translate('planning.minutes'),
      name: 'time',
      value: clone.time ? Number(clone.time) : 20,
      placeholder: translate('planning.minutes')
    }];

    if (field.id.includes('noteFld')) {
      inputs = [{
        type: 'textarea',
        label: translate('planning.note'),
        name: 'field',
        value: clone.name,
        placeholder: translate('planning.enterNote')
      }];
    }

    const alert = await this.alertController.create({
      header: translate('planning.editField'),
      inputs,
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('planning.update'),
        handler: (evt: any) => {
          if (!evt.field) {
            alert.message = translate('planning.enterItemPlease');
            return false;
          }
          field.name = evt.field;
          field.conductor = evt.conductor ?? '';
          field.info = evt.info?.trim() || undefined;
          field.time = evt.time ? String(evt.time) : field.time;
          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  async send(asImage: boolean = false, sideBySide: boolean = false) {
    if (!this.validate()) {
      return;
    }

    const name: string = this.attendance ? dayjs(this.attendances.find((att: Attendance) => att.id === this.attendance).date).format('DD_MM_YYYY') : dayjs().format('DD_MM_YYYY');
    const planningTitle = this.getEffectivePlanTitle();
    const branding = this.includeBranding
      ? await Utils.buildTenantBranding(this.db.getBrandingSource())
      : undefined;
    const blob = await Utils.createPlanExport({
      time: this.time,
      end: this.end,
      fields: this.selectedFields,
      asBlob: true,
      asImage,
      sideBySide,
      attendance: this.attendance,
      attendances: this.attendances,
      branding,
      dateLabel: this.currentPlanSubtitle(),
    }, planningTitle);
    this.db.sendPlanPerTelegram(blob, `${planningTitle.replace('(', '').replace(')', '')}_${name}${sideBySide ? '_2x' : ''}`, asImage);
  }

  private resolveOrgPlan(attendance: Attendance | undefined): boolean {
    if (!attendance) { return false; }
    if (attendance.plan) { return attendance.is_org_plan || false; }
    const attType = this.db.attendanceTypes().find((t: AttendanceType) => t.id === attendance.type_id);
    return attType?.is_default_org_plan ?? false;
  }

  onAttChange() {
    const attendance: Attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);

    if (!attendance) {return;}

    this.planIndex = 0;
    this.notes = attendance.notes;
    this.sharePlan = attendance.share_plan || false;
    this.isOrgPlan = this.resolveOrgPlan(attendance);
    this.planTitle = attendance.plan?.title ?? this.getDefaultPlanTitle(attendance);
    if (attendance.plan) {
      this.end = attendance.plan.end;
      this.time = attendance.plan.time;
      this.selectedFields = attendance.plan.fields.map((field: FieldSelection) => ({
          ...field,
          conductor: field.conductor || (this.history?.find((his: History) => his.songId === Number(field.id))?.conductorName || ''),
          ...(field.id === AGENDA_ITEMS_PLACEHOLDER_ID ? { time: '0' } : {}),
        }));
    } else if (this.history.length) {
      this.addDefaultFieldsFromAttendanceType(attendance.type_id);
    }

    this.calculateEnd();
  }

  async toggleSharePlan() {
    if (!this.attendance) {return;}

    await this.db.updateAttendance({ share_plan: this.sharePlan }, this.attendance);
    const att = this.attendances.find((a: Attendance) => a.id === this.attendance);
    if (att) {
      att.share_plan = this.sharePlan;
    }
  }

  async toggleOrgPlan() {
    if (!this.attendance) {return;}

    await this.db.updateAttendance({ is_org_plan: this.isOrgPlan }, this.attendance);
    const att = this.attendances.find((a: Attendance) => a.id === this.attendance);
    if (att) {
      att.is_org_plan = this.isOrgPlan;
    }
  }

  dismiss() {
    this.modalController.dismiss();
  }

  handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    const { from, to } = ev.detail;
    // The list is rebuilt from selectedFields, so Ionic must not move the DOM itself.
    ev.detail.complete(false);

    const rows = [...this.rows];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    if (!moved?.field) { return; }

    // Dropped right above a block's add row: it belongs into that block; right below it: it doesn't.
    const pos = rows.indexOf(moved);
    let join: string | null | undefined;
    if (!isGroupHead(moved.field)) {
      if (rows[pos + 1]?.addFor) { join = rows[pos + 1].addFor.id; }
      else if (rows[pos - 1]?.addFor) { join = null; }
    }

    const fieldRows = this.rows.filter(r => r.field);
    const visible = fieldRows.map(r => r.index);
    const fromField = fieldRows.indexOf(moved);
    const toField = rows.filter(r => r.field).indexOf(moved);
    this.selectedFields = moveRow(this.selectedFields, visible, fromField, toField, join);
    this.calculateEnd();
  }

  async removeField(index: number, slider: IonItemSliding) {
    slider.close();
    const field = this.selectedFields[index];
    if (isGroupHead(field)) {
      await this.confirmDeleteGroup(field);
      return;
    }
    this.selectedFields.splice(index, 1);
    this.calculateEnd();
  }

  // ---- Programmblöcke (see plan-groups.ts) ----

  /** Indenting needs a block right above; any Unterpunkt can be moved out. */
  canIndent(index: number): boolean {
    const field = this.selectedFields[index];
    if (!field || isGroupHead(field) || field.id === AGENDA_ITEMS_PLACEHOLDER_ID) { return false; }
    if (field.groupId) { return true; }
    const prev = this.selectedFields[index - 1];
    return !!prev && (isGroupHead(prev) || !!prev.groupId);
  }

  toggleIndent(index: number, slider: IonItemSliding) {
    slider.close();
    const field = this.selectedFields[index];
    if (field.groupId) {
      // Move it out below the block.
      const groupId = field.groupId;
      this.selectedFields.splice(index, 1);
      delete field.groupId;
      this.selectedFields.splice(lastIndexOfGroup(this.selectedFields, groupId) + 1, 0, field);
    } else {
      const prev = this.selectedFields[index - 1];
      field.groupId = isGroupHead(prev) ? prev.id : prev.groupId;
      this.collapsedGroups.delete(field.groupId);
    }
    this.calculateEnd();
  }

  async addGroup(popover: IonPopover) {
    popover?.dismiss();
    const alert = await this.alertController.create({
      header: translate('planning.addBlock'),
      message: translate('planning.blockDurationHint'),
      inputs: [
        { type: 'textarea', name: 'field', placeholder: translate('planning.blockNamePlaceholder') },
        { type: 'textarea', name: 'conductor', placeholder: translate('planning.performanceOptional') },
        { type: 'textarea', name: 'info', placeholder: translate('planning.infoOptional') },
      ],
      buttons: [
        { text: translate('common.cancel') },
        {
          text: translate('common.create'),
          handler: (evt: any) => {
            if (!evt.field?.trim()) {
              alert.message = translate('planning.enterNamePlease');
              return false;
            }
            const head = newGroupHead(evt.field.trim(), evt.conductor?.trim(), evt.info?.trim());
            this.selectedFields.push(head);
            this.calculateEnd();
            void this.addSubItem(head);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async addSubItem(head: FieldSelection) {
    const alert = await this.alertController.create({
      header: translate('planning.addSubItem'),
      subHeader: head.name,
      inputs: [
        { type: 'textarea', name: 'field', placeholder: translate('planning.subItemPlaceholder') },
        { type: 'textarea', name: 'conductor', placeholder: translate('planning.enterPerformer') },
        { type: 'textarea', name: 'info', placeholder: translate('planning.subItemInfoPlaceholder') },
        { type: 'number', label: translate('planning.minutes'), name: 'time', value: 5, placeholder: translate('planning.minutes') },
      ],
      buttons: [
        { text: translate('common.cancel') },
        {
          text: translate('attendance.add'),
          handler: (evt: any) => {
            if (!evt.field?.trim()) {
              alert.message = translate('planning.enterItemPlease');
              return false;
            }
            const at = lastIndexOfGroup(this.selectedFields, head.id) + 1;
            this.selectedFields.splice(at, 0, {
              id: `fld-${crypto.randomUUID()}`,
              name: evt.field.trim(),
              conductor: evt.conductor ?? '',
              info: evt.info?.trim() || undefined,
              time: evt.time ? String(evt.time) : '5',
              groupId: head.id,
            });
            this.collapsedGroups.delete(head.id);
            this.calculateEnd();
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async showGroupOptions(head: FieldSelection) {
    const buttons: ActionSheetButton[] = [
      { text: translate('planning.editBlock'), handler: () => { void this.editGroup(head); } },
      { text: translate('planning.addSubItem'), handler: () => { void this.addSubItem(head); } },
    ];
    if (this.isAdmin && childrenOf(this.selectedFields, head.id).length) {
      const exists = this.blockTemplates.some(t => t.name === head.name);
      buttons.push({ text: exists ? translate('planning.updateTemplate') : translate('planning.saveAsTemplate'), handler: () => { void this.saveBlockTemplate(head); } });
    }
    buttons.push(
      { text: translate('planning.dissolveBlock'), handler: () => { this.dissolveGroup(head); } },
      { text: translate('planning.deleteBlockWithItems'), role: 'destructive', handler: () => { void this.confirmDeleteGroup(head); } },
      { text: translate('common.cancel'), role: 'cancel' },
    );
    const sheet = await this.actionSheetController.create({
      header: head.name,
      subHeader: translate('planning.blockSubHeader', { count: childrenOf(this.selectedFields, head.id).length, min: this.groupMinutes(head) }),
      buttons,
    });
    await sheet.present();
  }

  private async editGroup(head: FieldSelection) {
    const alert = await this.alertController.create({
      header: translate('planning.editBlock'),
      inputs: [
        { type: 'textarea', label: translate('planning.name'), name: 'field', value: head.name, placeholder: translate('planning.name') },
        { type: 'textarea', label: translate('planning.performance'), name: 'conductor', value: head.conductor, placeholder: translate('planning.performanceOptional') },
        { type: 'textarea', label: translate('planning.info'), name: 'info', value: head.info, placeholder: translate('planning.infoOptional') },
      ],
      buttons: [
        { text: translate('common.cancel') },
        {
          text: translate('common.save'),
          handler: (evt: any) => {
            if (!evt.field?.trim()) {
              alert.message = translate('planning.enterNamePlease');
              return false;
            }
            head.name = evt.field.trim();
            head.conductor = evt.conductor ?? '';
            head.info = evt.info?.trim() || undefined;
            this.calculateEnd();
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  /** Removes the head; its Unterpunkte stay as normal fields. */
  dissolveGroup(head: FieldSelection) {
    this.selectedFields = this.selectedFields
      .filter(f => f.id !== head.id)
      .map(f => {
        if (f.groupId === head.id) { delete f.groupId; }
        return f;
      });
    this.collapsedGroups.delete(head.id);
    this.calculateEnd();
  }

  private async confirmDeleteGroup(head: FieldSelection) {
    const count = childrenOf(this.selectedFields, head.id).length;
    if (!count) {
      this.selectedFields = this.selectedFields.filter(f => f.id !== head.id);
      this.calculateEnd();
      return;
    }
    const alert = await this.alertController.create({
      header: translate('planning.deleteBlockConfirm'),
      message: translate('planning.blockHasItems', { name: head.name, count }),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        { text: translate('planning.onlyDissolve'), handler: () => { this.dissolveGroup(head); } },
        {
          text: translate('planning.deleteAll'),
          role: 'destructive',
          handler: () => {
            this.selectedFields = this.selectedFields.filter(f => f.id !== head.id && f.groupId !== head.id);
            this.calculateEnd();
          },
        },
      ],
    });
    await alert.present();
  }

  private async saveBlockTemplate(head: FieldSelection) {
    const template = blockTemplateFrom(this.selectedFields, head.id);
    const others = this.blockTemplates.filter(t => t.name !== template.name);
    try {
      await this.db.updateTenantData({ plan_block_templates: [...others, template] });
      Utils.showToast(translate('planning.templateSaved', { name: template.name }), 'success');
    } catch {
      Utils.showToast(translate('planning.templateSaveFailed'), 'danger');
    }
  }

  insertBlockTemplate(template: PlanBlockTemplate, popover: IonPopover) {
    popover?.dismiss();
    this.selectedFields.push(...cloneBlock(template.fields));
    this.calculateEnd();
  }

  async deleteBlockTemplate(template: PlanBlockTemplate, popover: IonPopover) {
    popover?.dismiss();
    const alert = await this.alertController.create({
      header: translate('planning.deleteTemplateConfirm'),
      message: translate('planning.deleteTemplateMessage', { name: template.name }),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            await this.db.updateTenantData({ plan_block_templates: this.blockTemplates.filter(t => t.id !== template.id) });
          },
        },
      ],
    });
    await alert.present();
  }

  async addExtraField(popover: IonPopover) {
    popover?.dismiss();
    const alert = await this.alertController.create({
      header: translate('planning.addField'),
      inputs: [{
        type: 'textarea',
        name: 'field',
        placeholder: translate('planning.enterFreeText')
      }, {
        type: 'textarea',
        name: 'conductor',
        placeholder: translate('planning.enterPerformer')
      }, {
        type: 'textarea',
        name: 'info',
        placeholder: translate('planning.infoOptional')
      }, {
        type: 'number',
        label: translate('planning.minutes'),
        name: 'time',
        value: 20,
        placeholder: translate('planning.minutes')
      }],
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('attendance.add'),
        handler: (evt: any) => {
          this.selectedFields.push({
            id: evt.field,
            name: evt.field,
            conductor: evt.conductor ?? '',
            info: evt.info?.trim() || undefined,
            time: evt.time ? String(evt.time) : '20',
          });

          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  async addNoteField(popover: IonPopover) {
    popover?.dismiss();

    const alert = await this.alertController.create({
      header: translate('planning.addNoteField'),
      inputs: [{
        type: 'textarea',
        name: 'field',
        placeholder: translate('planning.enterNote')
      }],
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('attendance.add'),
        handler: (evt: any) => {
          this.selectedFields.push({
            id: `noteFld ${evt.field}`,
            name: evt.field,
            conductor: '',
            time: '0',
          });

          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  addAgendaItemsPlaceholder(popover: IonPopover) {
    popover?.dismiss();
    if (this.selectedFields.some(f => f.id === AGENDA_ITEMS_PLACEHOLDER_ID)) {
      Utils.showToast(translate('planning.agendaExists'), 'warning');
      return;
    }
    this.selectedFields.push({
      id: AGENDA_ITEMS_PLACEHOLDER_ID,
      name: translate('planning.agenda'),
      time: '0',
    });
    this.calculateEnd();
  }

  addCurrentSongs(popover: IonPopover) {
    const songsToAdd: string[] = [];
    for (const historyItem of this.history) {
      if (!this.selectedFields.find((field: FieldSelection) => Number(field.id) === historyItem.songId)) {
        songsToAdd.push(String(historyItem.songId));
      }
    }
    this.onSongsChange(songsToAdd);
  }

  onAddSong(id: string, popover: IonPopover) {
    popover?.dismiss();
    const attendance: Attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    if (!id) {return;}
    this.onSongsChange([id]);
  }

  onSongsChange(ids: string[]) {
    const attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    const type = this.db.attendanceTypes().find((t: AttendanceType) => t.id === attendance?.type_id);

    for (const id of ids) {
      const song: Song = this.songs.find((song: Song) => song.id === parseInt(id));
      const conductor: string | undefined = this.history?.find((his: History) => his.songId === song.id)?.conductorName;
      const prefix = type?.planning_prefix_instance_name ? `${this.db.tenant().longName}: ` : `${song.number}. `;

      this.selectedFields.push({
        id,
        name: `${prefix}${song.name}`,
        time: '20',
        conductor: conductor || '',
        songId: song.id,
      });
    }

    this.calculateEnd();
  }

  calculateEnd(): void {
    normalizeGroups(this.selectedFields);
    let currentTime = dayjs(this.time);
    if (!currentTime.isValid()) {
      currentTime = dayjs().hour(Number(this.time.substring(0, 2))).minute(Number(this.time.substring(3, 5)));
    }

    for (const field of this.selectedFields) {
      currentTime = currentTime.add(parseInt(field.time) || 0, 'minutes');
    }

    this.end = currentTime.format('YYYY-MM-DDTHH:mm');

    this.updateAttendance();
  }

  /** True when the tenant has a logo and/or branding text configured. Gates the
   *  "Branding einbeziehen" toggle — no point offering it when nothing is defined. */
  public hasBranding(): boolean {
    const tenant = this.db.tenant();
    return Boolean(tenant?.logo_url || tenant?.branding_text);
  }

  async export(sideBySide: boolean = false) {
    if (!this.validate()) {
      return;
    }

    const planningTitle = this.getEffectivePlanTitle();
    const branding = this.includeBranding
      ? await Utils.buildTenantBranding(this.db.getBrandingSource())
      : undefined;

    await Utils.createPlanExport({
      time: this.time,
      end: this.end,
      fields: this.selectedFields,
      history: this.history,
      attendance: this.attendance,
      attendances: this.attendances,
      sideBySide,
      branding,
      dateLabel: this.currentPlanSubtitle(),
    }, planningTitle);
  }

  /** PDF subtitle for the open plan when the Termin has several; undefined keeps the default date. */
  private currentPlanSubtitle(): string | undefined {
    const att = this.currentAtt;
    return att && allPlans(att).length > 1 ? planSubtitle(att, this.planIndex) : undefined;
  }

  /** One PDF with a page per plan. */
  async exportAllPlans() {
    const att = this.currentAtt;
    if (!att) { return; }
    if (this.validate(false)) {
      await this.updateAttendance();
    }
    const branding = this.includeBranding
      ? await Utils.buildTenantBranding(this.db.getBrandingSource())
      : undefined;
    await Utils.exportAttendancePlans({
      attendance: att,
      type: this.db.attendanceTypes().find((t: AttendanceType) => t.id === att.type_id),
      indexes: allPlans(att).map((_, i) => i),
      branding,
    });
  }

  validate(showToast: boolean = true): boolean {
    if (!this.time || !this.selectedFields.length) {
      if (showToast) {
        Utils.showToast(translate('planning.chooseFieldMin'), 'warning');
      }
      return false;
    }

    if (!this.selectedFields.every(field => field.time)) {
      if (showToast) {
        Utils.showToast(translate('planning.fillRequired'), 'warning');
      }
      return false;
    }

    return true;
  }

  getAttTypeText(attendance: Attendance): string {
    const type = this.db.attendanceTypes().find((t: AttendanceType) => t.id === attendance.type_id);
    return Utils.getTypeTitle(type, attendance.typeInfo);
  }

  private getDefaultPlanTitle(attendance: Attendance | undefined): string {
    if (!attendance) {return '';}
    const type = this.db.attendanceTypes().find((t: AttendanceType) => t.id === attendance.type_id);
    return type ? Utils.getPlanningTitle(type, attendance.typeInfo) : '';
  }

  private getEffectivePlanTitle(): string {
    const attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    return this.planTitle?.trim() || this.getDefaultPlanTitle(attendance);
  }

  async shareCurrentPlan(editLink = false) {
    if (!this.attendance) {
      Utils.showToast(translate('planning.chooseEventFirst'), 'warning');
      return;
    }
    const sheet = await this.actionSheetController.create({
      header: translate('planning.shareLink'),
      buttons: [
        { text: translate('planning.readOnlyLink'), handler: () => this.doShareAttendancePlan(false) },
        { text: translate('planning.editLink'), handler: () => this.doShareAttendancePlan(true) },
        { text: translate('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async doShareAttendancePlan(editLink: boolean) {
    const att = this.attendances.find((a: Attendance) => a.id === this.attendance);
    if (!att) { return; }

    let shareKey = att.share_key;
    let shareEditKey = att.share_edit_key;

    if (!shareKey) {
      shareKey = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      shareEditKey = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      await this.db.updateAttendance({ share_key: shareKey, share_edit_key: shareEditKey } as any, this.attendance);
      att.share_key = shareKey;
      att.share_edit_key = shareEditKey;
    } else if (editLink && !shareEditKey) {
      shareEditKey = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      await this.db.updateAttendance({ share_edit_key: shareEditKey } as any, this.attendance);
      att.share_edit_key = shareEditKey;
    }

    const base = `https://attendix.de/plan?id=${this.attendance}&key=${shareKey}`;
    const url = editLink ? `${base}&edit=${shareEditKey}` : base;

    if (navigator.share) {
      await navigator.share({ url, title: this.getEffectivePlanTitle() });
    } else {
      await navigator.clipboard.writeText(url);
      Utils.showToast(translate('planning.linkCopied'), 'success');
    }
  }

  async revokeSharePlan() {
    if (!this.attendance) { return; }
    const alert = await this.alertController.create({
      header: translate('planning.unshareConfirm'),
      message: translate('planning.unshareMessage'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('planning.unshare'),
          role: 'destructive',
          handler: async () => {
            await this.db.updateAttendance({ share_key: null, share_edit_key: null } as any, this.attendance);
            const att = this.attendances.find((a: Attendance) => a.id === this.attendance);
            if (att) { att.share_key = null; att.share_edit_key = null; }
            Utils.showToast(translate('planning.unshared'), 'success');
          }
        },
      ],
    });
    await alert.present();
  }

  async showOptions() {
    const buttons: ActionSheetButton[] = [];

    if (this.selectedFields.length) {      buttons.push({
        text: translate('planning.exportPdf'),
        handler: () => this.export()
      });
      if (this.planLabels.length > 1) {
        buttons.push({
          text: translate('planning.exportPdfAll'),
          handler: () => this.exportAllPlans()
        });
      }
      buttons.push({
        text: translate('planning.exportPdfA5'),
        handler: () => this.export(true)
      });

      if (this.hasChatId) {
        buttons.push({
          text: translate('attendance.telegramPdf'),
          handler: () => this.send(false)
        });
        buttons.push({
          text: translate('attendance.telegramPdfA5'),
          handler: () => this.send(false, true)
        });
        buttons.push({
          text: translate('attendance.telegramImage'),
          handler: () => this.send(true)
        });
      }
    }

    if (this.db.tenant().type === DefaultAttendanceType.CHOIR || this.db.tenant().type === DefaultAttendanceType.ORCHESTRA) {
      buttons.push({
        text: translate('planning.createSectionalPlan'),
        handler: () => {
          this.planGroups = this.loadPlanGroups();
          this.planConductors = this.conductors
            .filter(c => !c.left)
            .map(c => `${c.firstName} ${c.lastName.substr(0, 1)}.`);
          this.isPlanModalOpen = true;
        }
      });
    }

    buttons.push({
      text: translate('common.cancel'),
      role: 'cancel',
    });

    const actionSheet = await this.actionSheetController.create({
      header: translate('person.actions'),
      buttons
    });
    await actionSheet.present();
  }

  getDefaultPlanGroups(): string[] {
    if (this.groupCategories?.length) {
      return this.groupCategories.map(cat => cat.name);
    }
    return this.db.tenant().type === DefaultAttendanceType.CHOIR
      ? [translate('planning.soprano'), translate('planning.alto'), translate('planning.tenor'), translate('planning.bass')]
      : [translate('planning.strings'), translate('planning.woodwinds'), translate('common.otherPlural')];
  }

  loadPlanGroups(): string[] {
    const key = `registerplan-groups-${this.db.tenant().id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed;
      }
    }
    return this.getDefaultPlanGroups();
  }

  savePlanGroups(groups: string[]): void {
    const key = `registerplan-groups-${this.db.tenant().id}`;
    localStorage.setItem(key, JSON.stringify(groups));
  }

  addPlanGroup() {
    this.planGroups.push('');
  }

  addPlanConductor() {
    this.planConductors.push('');
  }

  removePlanConductor(index: number) {
    if (this.planConductors.length > 1) {
      this.planConductors.splice(index, 1);
    }
  }

  isPlanExportDisabled(time: string | number | undefined): boolean {
    return !this.planConductors.length || this.planConductors.some(c => !c.trim()) || !time || this.planGroups.length < 2 || this.planGroups.some(g => !g.trim());
  }

  removePlanGroup(index: number) {
    if (this.planGroups.length > 2) {
      this.planGroups.splice(index, 1);
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  async createPlan(timeString: string | number, modal: IonModal, perTelegram?: boolean, asImage?: boolean): Promise<void> {
    this.savePlanGroups(this.planGroups);

    const shuffledConductors: string[] = this.shuffle([...this.planConductors]);
    const attendance = this.attendances.find((att: Attendance) => att.id === this.attendance);
    const date: string = attendance ? dayjs(attendance.date).format(dateFmt()) : dayjs().format(dateFmt());
    const data = [];
    const groupCount = this.planGroups.length;
    const numRows = Math.max(shuffledConductors.length, groupCount);
    const timePerUnit: number = Number(timeString) / numRows;

    for (let index = 0; index < numRows; index++) {
      const slotTime = Math.round(timePerUnit * index);
      const row: string[] = [String(slotTime)];
      for (let g = 0; g < groupCount; g++) {
        const candidate = (index + g) % numRows;
        row.push(candidate < shuffledConductors.length ? shuffledConductors[candidate] : '');
      }
      data.push(row);
    }

    // Lazy load jsPDF
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF({ compress: true });
    await Utils.registerExportFont(doc);
    const branding = this.includeBranding
      ? await Utils.buildTenantBranding(this.db.getBrandingSource())
      : undefined;
    const headerOpts = {
      title: translate('planning.sectionalPlanTitle', { tenant: this.db.tenant().shortName }),
      subtitle: translate('planning.asOf', { date }),
    };
    const contentTop = Utils.addBrandingHeader(doc, branding, headerOpts);
    (doc as any).autoTable({
      head: [[translate('planning.minutes'), ...this.planGroups]],
      body: data,
      margin: { top: contentTop, bottom: 14 },
      theme: 'plain',
      styles: { font: Utils.EXPORT_FONT, fontSize: 11, cellPadding: 3.5, textColor: [30, 30, 30], lineColor: [180, 180, 180], lineWidth: 0 },
      headStyles: { fillColor: false, textColor: [50, 50, 50], fontStyle: 'bold', lineWidth: { bottom: 0.5 }, lineColor: [100, 100, 100] },
      bodyStyles: { fillColor: false },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      didDrawPage: () => {
        Utils.addBrandingHeader(doc, branding, headerOpts);
      }
    });

    if (perTelegram) {
      let blob: Blob = doc.output('blob');
      if (asImage) {
        const pdfDataUri = doc.output('datauristring');
        blob = await Utils.pdfDataUriToImageBlob(pdfDataUri);
      }
      this.db.sendPlanPerTelegram(blob, `Registerprobenplan_${dayjs().format('DD_MM_YYYY')}`, asImage);
    } else {
      const fileName = `${this.db.tenant().shortName} Registerprobenplan: ${date}.pdf`;
      await Utils.downloadFileNative(doc.output('blob'), fileName);
    }

    modal.dismiss();
  }

  shuffle(a: string[]) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  getMissingGroups(songId: number): string {
    const song = this.songs.find((s: Song) => s.id === songId);

    if (!song || !song.instrument_ids || !song.instrument_ids.length) {
      return '';
    }

    const text = Utils.getInstrumentText(song.instrument_ids, this.db.groups().filter((group: Group) => group.maingroup !== true), this.groupCategories);
    return text;
  }

  nextAtt() {
    const currentIndex = this.attendances.findIndex((att: Attendance) => att.id === this.attendance);
    if (currentIndex > 0) {
      this.attendance = this.attendances[currentIndex - 1].id;
      this.onAttChange();
    } else {
      Utils.showToast(translate('planning.firstEvent'), 'warning');
    }
  }

  prevAtt() {
    const currentIndex = this.attendances.findIndex((att: Attendance) => att.id === this.attendance);
    if (currentIndex < this.attendances.length - 1) {
      this.attendance = this.attendances[currentIndex + 1].id;
      this.onAttChange();
    } else {
      Utils.showToast(translate('planning.lastEvent'), 'warning');
    }
  }

  async updateAttendance() {
    if (this.attendances.length && this.attendance) {
      if (!this.validate(false)) {
        return;
      }

      const att = this.attendances.find((att: Attendance) => att.id === this.attendance);
      const plans = allPlans(att);
      const current: Plan = {
        ...(plans[this.planIndex] ?? {}),
        time: this.time,
        fields: this.selectedFields,
        end: this.end,
        title: this.planTitle?.trim() || undefined,
      };

      if (plans.length < 2) {
        // Single plan: only touch `plan`, exactly as before.
        const result = await this.db.updateAttendance({ plan: current }, this.attendance);
        att.plan = result.plan;
        return;
      }

      plans[this.planIndex] = { ...current, time: this.toHHmm(this.time) };
      const result = await this.db.updateAttendance(splitPlans(plans) as Partial<Attendance>, this.attendance);
      att.plan = result.plan;
      att.extra_plans = result.extra_plans;
    }
  }

  // ---- several Ablaufpläne per Termin (see plan-days.ts) ----

  /** Saves the open plan (when valid) before switching or changing plans. */
  private async saveOpenPlan() {
    if (this.validate(false)) {
      await this.updateAttendance();
    }
  }

  /** Plans store their start as "HH:mm" (the editor works with ISO strings). */
  private toHHmm(time: string): string {
    return time && dayjs(time).isValid() ? dayjs(time).format('HH:mm') : time;
  }

  private loadPlan(att: Attendance, plan: Plan | undefined) {
    this.planTitle = plan?.title ?? this.getDefaultPlanTitle(att);
    this.time = plan?.time || this.time;
    this.end = plan?.end || this.time;
    this.selectedFields = (plan?.fields ?? []).map((field: FieldSelection) => ({
      ...field,
      conductor: field.conductor || (this.history?.find((his: History) => his.songId === Number(field.id))?.conductorName || ''),
      ...(field.id === AGENDA_ITEMS_PLACEHOLDER_ID ? { time: '0' } : {}),
    }));
  }

  /** Writes each plan's day explicitly so reordering or deleting doesn't shift days. */
  private withDays(att: Attendance, plans: Plan[]): Plan[] {
    if (!isMultiDay(att)) { return plans.map(p => ({ ...p })); }
    return plans.map((p, i) => ({ ...p, day: planDay(att, plans, i) }));
  }

  private async savePlans(att: Attendance, plans: Plan[]) {
    const result = await this.db.updateAttendance(splitPlans(plans) as Partial<Attendance>, att.id);
    att.plan = result.plan;
    att.extra_plans = result.extra_plans;
  }

  async selectPlan(index: number) {
    const att = this.currentAtt;
    if (!att || index === this.planIndex) { return; }
    await this.saveOpenPlan();
    this.planIndex = index;
    this.loadPlan(att, allPlans(att)[index]);
  }

  async addPlan(popover?: IonPopover) {
    popover?.dismiss();
    const att = this.currentAtt;
    if (!att) {
      Utils.showToast(translate('planning.chooseEventFirst'), 'warning');
      return;
    }
    if (!this.validate(false)) {
      Utils.showToast(translate('planning.createRunSheetFirst'), 'warning');
      return;
    }
    await this.updateAttendance();

    const alert = await this.alertController.create({
      header: translate('planning.addAnotherPlan'),
      message: translate('planning.addAnotherPlanMessage'),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        { text: translate('planning.empty'), handler: () => { void this.createAdditionalPlan(false); } },
        { text: translate('planning.copy'), handler: () => { void this.createAdditionalPlan(true); } },
      ],
    });
    await alert.present();
  }

  private async createAdditionalPlan(copy: boolean) {
    const att = this.currentAtt;
    if (!att) { return; }
    const plans = this.withDays(att, allPlans(att));
    const type = this.db.attendanceTypes().find((t: AttendanceType) => t.id === att.type_id);
    const time = this.toHHmm(copy ? this.time : (type?.start_time || att.start_time || this.time));
    const newPlan: Plan = {
      id: crypto.randomUUID(),
      day: nextFreeDay(att, plans),
      time,
      end: copy ? this.end : dayjs().hour(Number(time.substring(0, 2))).minute(Number(time.substring(3, 5))).format('YYYY-MM-DDTHH:mm'),
      // Topics (TOPs) stay in the first plan.
      fields: copy
        ? this.selectedFields
          .filter(f => !f.agendaItemId && f.id !== AGENDA_ITEMS_PLACEHOLDER_ID)
          .map(f => ({ ...f }))
        : [],
      title: copy ? (this.planTitle?.trim() || undefined) : undefined,
    };
    plans.push(newPlan);
    await this.savePlans(att, plans);
    this.planIndex = plans.length - 1;
    this.loadPlan(att, newPlan);
    if (copy) {
      this.calculateEnd();
    }
  }

  async showPlanOptions() {
    const att = this.currentAtt;
    if (!att) { return; }
    const plans = allPlans(att);
    const index = this.planIndex;
    const buttons: ActionSheetButton[] = [
      { text: translate('planning.rename'), handler: () => { void this.renamePlan(); } },
    ];
    if (dayOptions(att).length) {
      buttons.push({ text: translate('planning.assignOtherDay'), handler: () => { void this.assignPlanDay(); } });
    }
    if (index > 0) {
      buttons.push({ text: translate('planning.moveLeft'), handler: () => { void this.movePlan(-1); } });
    }
    if (index < plans.length - 1) {
      buttons.push({ text: translate('planning.moveRight'), handler: () => { void this.movePlan(1); } });
    }
    buttons.push({ text: translate('planning.deletePlan'), role: 'destructive', handler: () => { void this.deletePlan(); } });
    buttons.push({ text: translate('common.cancel'), role: 'cancel' });

    const sheet = await this.actionSheetController.create({
      header: translate('planning.planHeader', { label: planLabel(att, index, plans) }),
      subHeader: `${index + 1} von ${plans.length}`,
      buttons,
    });
    await sheet.present();
  }

  private async renamePlan() {
    const att = this.currentAtt;
    if (!att) { return; }
    await this.saveOpenPlan();
    const plans = allPlans(att);
    const index = this.planIndex;
    const auto = planLabel(att, index, plans.map(p => ({ ...p, label: undefined })));
    const alert = await this.alertController.create({
      header: translate('planning.renamePlan'),
      message: translate('planning.renameHint'),
      inputs: [{ type: 'text', name: 'label', value: plans[index]?.label ?? '', placeholder: auto }],
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: async (evt: any) => {
            const updated = this.withDays(att, allPlans(att));
            updated[index] = { ...updated[index], label: evt.label?.trim() || undefined };
            await this.savePlans(att, updated);
          },
        },
      ],
    });
    await alert.present();
  }

  private async assignPlanDay() {
    const att = this.currentAtt;
    if (!att) { return; }
    await this.saveOpenPlan();
    const plans = this.withDays(att, allPlans(att));
    const index = this.planIndex;
    const alert = await this.alertController.create({
      header: translate('planning.assignDay'),
      inputs: dayOptions(att).map(o => ({
        type: 'radio' as const,
        label: o.label,
        value: o.day,
        checked: plans[index]?.day === o.day,
      })),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.save'),
          handler: async (day: number) => {
            if (day === undefined || day === null) { return; }
            const moved = { ...plans[index], day };
            plans[index] = moved;
            // Keep chips in day order.
            plans.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
            await this.savePlans(att, plans);
            this.planIndex = plans.indexOf(moved);
          },
        },
      ],
    });
    await alert.present();
  }

  private async movePlan(direction: -1 | 1) {
    const att = this.currentAtt;
    if (!att) { return; }
    await this.saveOpenPlan();
    const plans = this.withDays(att, allPlans(att));
    const from = this.planIndex;
    const to = from + direction;
    if (to < 0 || to >= plans.length) { return; }
    [plans[from], plans[to]] = [plans[to], plans[from]];
    await this.savePlans(att, plans);
    this.planIndex = to;
  }

  private async deletePlan() {
    const att = this.currentAtt;
    if (!att) { return; }
    const plans = allPlans(att);
    const index = this.planIndex;
    const alert = await this.alertController.create({
      header: translate('planning.deletePlanConfirm'),
      message: translate('planning.deletePlanMessage', { label: planLabel(att, index, plans) }),
      buttons: [
        { text: translate('common.cancel'), role: 'cancel' },
        {
          text: translate('common.delete'),
          role: 'destructive',
          handler: async () => {
            const remaining = this.withDays(att, allPlans(att));
            remaining.splice(index, 1);
            await this.savePlans(att, remaining);
            this.planIndex = Math.min(index, remaining.length - 1);
            this.loadPlan(att, remaining[this.planIndex]);
          },
        },
      ],
    });
    await alert.present();
  }

  async resetPlan() {
    const alert = await this.alertController.create({
      header: translate('planning.resetPlan'),
      message: translate('planning.resetPlanMessage'),
      buttons: [
        {
          text: translate('common.cancel'),
        },
        {
          text: translate('dateDialog.reset'),
          handler: () => {
            this.addDefaultFieldsFromAttendanceType(this.attendances.find((att: Attendance) => att.id === this.attendance)?.type_id);
          }
        }
      ]
    });

    await alert.present();
  }

  addDefaultFieldsFromAttendanceType(typeId: string) {
    const attType = this.db.attendanceTypes().find((at: AttendanceType) => at.id === typeId);

    if (attType?.default_plan?.fields?.length) {
      this.time = attType.start_time;
      this.selectedFields = this.resolvePlaceholderFields(attType.default_plan.fields, attType);
    } else {
      this.selectedFields = [];
    }

    this.calculateEnd();
  }

  private resolvePlaceholderFields(fields: FieldSelection[], attType?: AttendanceType): FieldSelection[] {
    const songsAdded: Set<string> = new Set<string>();
    const result: FieldSelection[] = [];

    for (const field of fields) {
      if (field.id.startsWith('song-placeholder-')) {
        const historyItem = this.history.find((his: History) => !songsAdded.has(String(his.songId)));
        if (historyItem) {
          songsAdded.add(String(historyItem.songId));
          const song: Song = this.songs.find((song: Song) => song.id === historyItem.songId);
          const conductor: string | undefined = this.history?.find((his: History) => his.songId === song.id)?.conductorName;
          const prefix = attType?.planning_prefix_instance_name ? `${this.db.tenant().longName}: ` : `${song.number}. `;

          result.push({
            ...field,
            id: String(song.id),
            name: `${prefix}${song.name}`,
            conductor: conductor || '',
            songId: song.id,
          });
        }
        continue;
      }

      result.push(field.id === AGENDA_ITEMS_PLACEHOLDER_ID ? { ...field, time: '0' } : { ...field });
    }

    return result;
  }

  get availableTemplates(): Plan[] {
    return this.db.organisation()?.planning_templates ?? [];
  }

  get orgDefaultFields(): FieldSelection[] {
    return this.db.organisation()?.default_fields ?? [];
  }

  applyTemplate(template: Plan, popover: IonPopover) {
    popover.dismiss();
    this.selectedFields = this.resolvePlaceholderFields(template.fields);
    if (template.time) { this.time = template.time; }
    this.calculateEnd();
  }

  addOrgField(field: FieldSelection, popover: IonPopover) {
    popover.dismiss();
    this.selectedFields.push({ ...field });
    this.calculateEnd();
  }

  openSongSelector() {
    this.isSongSelectorOpen = true;
  }

  closeSongSelector() {
    this.isSongSelectorOpen = false;
    this.resetSongSearch();
  }

  selectSong(songId: number) {
    this.onAddSong(songId.toString(), null);
    this.closeSongSelector();
  }

  onSongSearch(event: any) {
    const searchTerm = event.detail.value?.toLowerCase() || '';
    this.songSearchTerm = searchTerm;

    if (!searchTerm.trim()) {
      this.filteredSongs = [...this.songs];
      return;
    }

    this.filteredSongs = this.songs.filter(song => {
      const songText = `${song.prefix || ''}${song.number} ${song.name}`.toLowerCase();
      return songText.includes(searchTerm);
    });
  }

  resetSongSearch() {
    this.songSearchTerm = '';
    this.filteredSongs = [...this.songs];
  }

}
