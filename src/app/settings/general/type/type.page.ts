import { Component, HostListener, Input, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, AlertInput, IonItemSliding, IonModal, IonPopover, IonRouterOutlet, ItemReorderEventDetail, ModalController, NavController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { DataService } from 'src/app/services/data.service';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus, CHECKLIST_DEADLINE_OPTIONS } from 'src/app/utilities/constants';
import { AttendanceType, ChecklistItem, FieldSelection, Plan, RegistrationField, RegistrationFieldType, AGENDA_ITEMS_PLACEHOLDER_ID } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

@Component({
    selector: 'app-type',
    templateUrl: './type.page.html',
    styleUrls: ['./type.page.scss'],
    standalone: false
})
export class TypePage implements OnInit {
  @Input() isNew: boolean;
  public type: AttendanceType;
  public isGeneral = false;
  readonly AGENDA_ITEMS_PLACEHOLDER_ID = AGENDA_ITEMS_PLACEHOLDER_ID;
  public attendanceStatuses = [
    AttendanceStatus.Neutral,
    AttendanceStatus.Present,
    AttendanceStatus.Absent,
    AttendanceStatus.Excused,
    AttendanceStatus.Late,
  ];
  public defaultPlan: Plan = {
    time: '',
    end: '',
    fields: [],
  };
  public end: string;
  public colors: string[] = ['primary', 'secondary', 'tertiary', 'success', 'warning', 'danger', 'rosa', 'mint', 'orange'];
  public additionalFieldFilter: string = null;
  public customReminderHours: number | null = null;
  @ViewChild('remindersModal') remindersModal: IonModal;

  // Checklist configuration
  public checklistDeadlineOptions = CHECKLIST_DEADLINE_OPTIONS;
  public newChecklistText = '';
  public newChecklistDeadline: number | null = null;
  public customChecklistDeadline: number | null = null;

  private originalType = '';  // JSON string of original type for comparison

  // Browser/PWA: Warn before closing tab with unsaved changes
  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) {
      $event.returnValue = true;
    }
  }

  constructor(
    public modalController: ModalController,
    public db: DbService,
    public dataService: DataService,
    public route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController,
    private navController: NavController,
  ) { }

  async ngOnInit() {
    this.isGeneral = this.db.tenant().type === 'general';
    if (this.isNew) {
      this.type = {
        name: '',
        planning_title: '',
        default_status: AttendanceStatus.Present,
        available_statuses: [
          AttendanceStatus.Neutral,
          AttendanceStatus.Present,
          AttendanceStatus.Absent,
          AttendanceStatus.Excused,
          AttendanceStatus.Late,
        ],
        manage_songs: false,
        start_time: '19:00',
        end_time: '20:30',
        relevant_groups: [],
        tenant_id: this.db.tenant().id,
        index: 999,
        visible: true,
        color: 'primary',
        highlight: false,
        hide_name: false,
        include_in_average: true,
        additional_fields_filter: null,
        reminders: [],
      };
      this.type.default_plan = { ...this.defaultPlan };
    } else {
      const id = this.route.snapshot.paramMap.get('id');
      const existingType = await this.db.getAttendanceType(id);
      this.dutyModeAtLoad = !!existingType.duty_mode;

      this.type = {
        ...existingType,
        default_plan: existingType.default_plan ? { ...existingType.default_plan } : undefined
      };

      // All-day types may have been created without a start_time. The plan's
      // start-time picker (ion-datetime, presentation="time") needs a valid
      // value to render and be editable, so backfill a sensible default.
      if (!this.type.start_time) {
        this.type.start_time = '19:00';
      }

      if (!this.type.default_plan?.fields) {
        this.type.default_plan = { ...this.defaultPlan };
      } else {
        // The agenda marker takes no time (older plans stored 30 min on it).
        this.type.default_plan.fields = this.type.default_plan.fields.map(f =>
          f.id === AGENDA_ITEMS_PLACEHOLDER_ID ? { ...f, time: '0' } : f);
      }
    }

    this.additionalFieldFilter = this.db.getPersonExtraFields().find(field => field.id === this.type.additional_fields_filter?.key) ? this.type.additional_fields_filter?.key ?? null : null;

    // Store original state for change detection
    this.originalType = JSON.stringify(this.type);
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    if (!this.type || this.isNew) {return false;}
    return JSON.stringify(this.type) !== this.originalType;
  }

  /**
   * Mark current state as saved (update original)
   */
  private dutyModeAtLoad = false;

  private markAsSaved(): void {
    this.originalType = JSON.stringify(this.type);
  }

  /**
   * Navigate back with unsaved changes check
   */
  async navigateBack(): Promise<void> {
    if (this.hasUnsavedChanges()) {
      const shouldLeave = await this.confirmUnsavedChanges();
      if (!shouldLeave) {return;}
    }
    this.navController.back();
  }

  /**
   * Show confirmation dialog for unsaved changes
   * Returns true if user wants to leave/discard, false to stay
   */
  private async confirmUnsavedChanges(): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertController.create({
        header: translate('rolePerm.unsaved'),
        message: translate('rolePerm.unsavedMessage'),
        buttons: [
          {
            text: translate('common.cancel'),
            role: 'cancel',
            handler: () => resolve(false)
          },
          {
            text: translate('rolePerm.discard'),
            role: 'destructive',
            handler: () => resolve(true)
          },
          {
            text: translate('common.save'),
            handler: async () => {
              await this.save();
              resolve(true);
            }
          }
        ]
      });
      await alert.present();
    });
  }

  async save() {
    if (!this.validate()) {
      return;
    }

    try {
      await this.db.updateAttendanceType(this.type.id, this.type);
      this.markAsSaved();
      Utils.showToast(translate('typeSettings.updated'), 'success');
    } catch (error) {
      Utils.showToast(translate('typeSettings.updateFailed'), 'danger');
      return;
    }
    await this.offerDutyView();
  }

  async createType() {
    if (!this.validate()) {
      return;
    }

    try {
      this.type = await this.db.addAttendanceType(this.type);
      Utils.showToast(translate('typeSettings.created'), 'success');
      await this.offerDutyView();
      await this.modalController.dismiss();
    } catch (error) {
      Utils.showToast(translate('typeSettings.createFailed'), 'danger');
    }
  }

  validate(): boolean {
    // ion-input delivers strings; the column is an integer (NOT NULL, default 10).
    const duration = Math.round(Number(this.type.agenda_default_duration));
    if (duration > 0) {
      this.type.agenda_default_duration = duration;
    } else {
      delete this.type.agenda_default_duration;
    }
    if (!this.type.name || this.type.name.trim().length === 0) {
      Utils.showToast(translate('typeSettings.enterName'), 'danger');
      return false;
    } else if (this.type.available_statuses.length === 1) {
      Utils.showToast(translate('typeSettings.twoStatus'), 'danger');
      return false;
    }

    return true;
  }

  async deleteType() {
    const alert = await this.alertController.create({
      header: translate('typeSettings.deleteType'),
      message: translate('typeSettings.deleteTypeMessage', { name: this.type.name }),
      buttons: [{
        text: translate('common.cancel'),
      }, {
        text: translate('common.delete'),
        role: 'destructive',
        handler: async () => {
          try {
            await this.db.deleteAttendanceType(this.type.id);
            Utils.showToast(translate('typeSettings.deleted'), 'success');
            this.router.navigate(['/tabs/settings/general/types']);
          } catch (error) {
            Utils.showToast(translate('typeSettings.deleteFailed'), 'danger');
          }
        }
      }]
    });

    await alert.present();
  }

  async dismiss() {
    // For new types in modal, check if any meaningful data was entered
    if (this.isNew && this.type.name?.trim()) {
      const alert = await this.alertController.create({
        header: translate('typeSettings.discardChanges'),
        message: translate('typeSettings.discardMessage'),
        buttons: [
          {
            text: translate('common.cancel'),
            role: 'cancel'
          },
          {
            text: translate('rolePerm.discard'),
            role: 'destructive',
            handler: async () => {
              await this.modalController.dismiss();
            }
          }
        ]
      });
      await alert.present();
    } else {
      await this.modalController.dismiss();
    }
  }

  getAttendanceStatusDescription(status: AttendanceStatus): string {
    return Utils.getAttendanceStatusDescription(status);
  }

  calculateTime(field: FieldSelection, index: number) {
    let minutesToAdd = 0;
    let currentIndex = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.type.default_plan.fields[currentIndex].time);
      currentIndex++;
    }

    const time: dayjs.Dayjs = dayjs(this.type.start_time).isValid() ? dayjs(this.type.start_time) : dayjs().hour(Number(this.type.start_time.substring(0, 2))).minute(Number(this.type.start_time.substring(3, 5)));
    return `${time.add(minutesToAdd, 'minute').format('HH:mm')} ${field.conductor ? `| ${field.conductor}` : ''}`;
  }

  async addExtraField(popover: IonPopover) {
    await popover.dismiss();

    const alert = await this.alertController.create({
      header: translate('typeSettings.addField'),
      inputs: [{
        type: 'textarea',
        name: 'field',
        placeholder: translate('typeSettings.freeTextPh')
      }, {
        type: 'textarea',
        name: 'info',
        placeholder: translate('typeSettings.infoOptional')
      }],
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('attendance.add'),
        handler: (evt: any) => {
          this.type.default_plan.fields.push({
            id: evt.field,
            name: evt.field,
            info: evt.info?.trim() || undefined,
            time: '20',
          });

          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  addSongPlaceholder(popover: IonPopover) {
    popover.dismiss();

    const numberOfSongs = this.type.default_plan.fields.filter(f => f.id?.startsWith('song-placeholder-')).length;

    this.type.default_plan.fields.push({
      id: `song-placeholder-${numberOfSongs + 1}`,
      name: translate('typeSettings.songPlaceholderN', { n: numberOfSongs + 1 }),
      time: '20',
    });

    this.calculateEnd();
  }

  get hasAgendaMarker(): boolean {
    return !!this.type?.default_plan?.fields?.some(f => f.id === AGENDA_ITEMS_PLACEHOLDER_ID);
  }

  /** Fills the defaults of the agenda settings the first time the feature is switched on. */
  onProtocolToggle() {
    if (!this.type.enable_protocol) return;
    if (!this.type.agenda_default_duration) this.type.agenda_default_duration = 10;
    if (this.type.suggest_postponed === undefined || this.type.suggest_postponed === null) this.type.suggest_postponed = true;
  }

  /** Dienst-Modus: nobody is expected until assigned, so new Termine start neutral. */
  onDutyToggle() {
    if (!this.type.duty_mode) return;
    if (!this.type.duty_required) this.type.duty_required = 1;
    if (this.type.duty_self_signup === undefined || this.type.duty_self_signup === null) this.type.duty_self_signup = true;
    if (this.type.duty_notify_understaffed === undefined || this.type.duty_notify_understaffed === null) this.type.duty_notify_understaffed = true;
    if (this.type.duty_confirm_reminder_days === undefined) this.type.duty_confirm_reminder_days = 2;
    const statuses = new Set(this.type.available_statuses ?? []);
    [AttendanceStatus.Neutral, AttendanceStatus.Present, AttendanceStatus.Excused].forEach(st => statuses.add(st));
    this.type.available_statuses = [...statuses].sort((a, b) => a - b);
    this.type.default_status = AttendanceStatus.Neutral;
  }

  /**
   * After the first Termintyp with Dienst-Modus: ask once whether "Meine
   * Termine" should become the Dienstplan view. Changeable later in the
   * instance settings.
   */
  private async offerDutyView(): Promise<void> {
    if (!this.type?.duty_mode || this.dutyModeAtLoad || this.db.tenant()?.duty_view) return;
    this.dutyModeAtLoad = true;
    const otherDutyTypes = this.db.attendanceTypes().filter(t => t.duty_mode && t.id !== this.type.id);
    if (otherDutyTypes.length) return;
    const alert = await this.alertController.create({
      header: translate('typeSettings.useDutyView'),
      message: translate('typeSettings.useDutyViewMessage'),
      buttons: [
        { text: translate('typeSettings.normalView'), role: 'cancel' },
        {
          text: translate('typeSettings.useIt'),
          handler: async () => {
            try {
              await this.db.updateTenantData({ duty_view: true });
              Utils.showToast(translate('typeSettings.dutyViewActive'), 'success');
            } catch {
              Utils.showToast(translate('typeSettings.viewFailed'), 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
    await alert.onDidDismiss();
  }

  openDutyHelp() {
    this.navController.navigateForward('/tabs/settings/help/article/duty-setup');
  }

  openTeamHelp() {
    this.navController.navigateForward('/tabs/settings/help/article/team-activate');
  }

  addAgendaItemsPlaceholder(popover?: IonPopover) {
    popover?.dismiss();

    const alreadyExists = this.type.default_plan.fields.some(f => f.id === AGENDA_ITEMS_PLACEHOLDER_ID);
    if (alreadyExists) {
      Utils.showToast(translate('typeSettings.agendaExists'), 'warning');
      return;
    }

    this.type.default_plan.fields.push({
      id: AGENDA_ITEMS_PLACEHOLDER_ID,
      name: translate('typeSettings.agenda'),
      time: '0',
    });

    this.calculateEnd();
  }

  async addNoteField(popover: IonPopover) {
    await popover.dismiss();

    const alert = await this.alertController.create({
      header: translate('typeSettings.addNoteField'),
      inputs: [{
        type: 'textarea',
        name: 'field',
        placeholder: translate('typeSettings.notePh')
      }],
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('attendance.add'),
        handler: (evt: any) => {
          this.type.default_plan.fields.push({
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

  handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    ev.detail.complete(this.type.default_plan.fields);

    this.calculateEnd();
  }

  removeField(index: number, slider: IonItemSliding) {
    this.type.default_plan.fields.splice(index, 1);
    slider.close();
    this.calculateEnd();
  }

  async changeField(field: FieldSelection, slider?: IonItemSliding) {
    slider?.close();
    const clone: FieldSelection = JSON.parse(JSON.stringify(field));
    let inputs: AlertInput[] = [{
      label: translate('typeSettings.programmeItem'),
      type: 'text',
      name: 'field',
      value: clone.name,
      placeholder: translate('typeSettings.programmeItemPh')
    }, {
      label: translate('typeSettings.performer'),
      type: 'text',
      name: 'conductor',
      value: clone.conductor,
      placeholder: translate('typeSettings.performerPh')
    }, {
      label: translate('typeSettings.info'),
      type: 'text',
      name: 'info',
      value: clone.info,
      placeholder: translate('typeSettings.infoOptionalDots')
    }];

    if (field.id.includes('noteFld')) {
      inputs = [{
        label: translate('typeSettings.note'),
        type: 'textarea',
        name: 'field',
        value: clone.name,
        placeholder: translate('typeSettings.notePh')
      }];
    }

    const alert = await this.alertController.create({
      header: translate('typeSettings.editField'),
      inputs,
      buttons: [{
        text: translate('common.cancel')
      }, {
        text: translate('typeSettings.update'),
        handler: (evt: any) => {
          if (!evt.field) {
            alert.message = translate('typeSettings.enterItem');
            return false;
          }
          field.name = evt.field;
          field.conductor = evt.conductor ?? '';
          field.info = evt.info?.trim() || undefined;
          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  calculateEnd(): void {
    let currentTime = dayjs(this.type.start_time);
    if (!currentTime.isValid()) {
      currentTime = dayjs().hour(Number(this.type.start_time.substring(0, 2))).minute(Number(this.type.start_time.substring(3, 5)));
    }

    for (const field of this.type.default_plan.fields) {
      currentTime = currentTime.add(parseInt(field.time), 'minutes');
    }

    this.end = currentTime.format('YYYY-MM-DDTHH:mm');
  }

  onAvailableStatusesChanged() {
    if (!this.type.available_statuses.includes(this.type.default_status)) {
      this.type.default_status = AttendanceStatus.Present;
    }
  }

  areSelectFieldsAvailable(): boolean {
    return Boolean(this.db.getPersonExtraFields().length && this.db.getPersonExtraFields().find(field => field.type === 'select' || field.type === 'boolean'));
  }

  selectedFieldType(): string | undefined {
    return this.db.getPersonExtraFields().find(f => f.id === this.additionalFieldFilter)?.type;
  }

  onAdditionalFieldFilterChanged() {
    if (this.additionalFieldFilter) {
      const field = this.db.getPersonExtraFields().find(f => f.id === this.additionalFieldFilter);
      this.type.additional_fields_filter = {
        key: this.additionalFieldFilter,
        option: field?.type === 'boolean' ? true : field?.options?.[0]
      };
    } else {
      this.type.additional_fields_filter = null;
    }
  }

  /**
   * Predefined reminder options in hours
   */
  readonly predefinedReminders = [1, 24, 48, 72];

  /**
   * Close the reminders modal
   */
  async closeRemindersModal() {
    const modal = await this.modalController.getTop();
    if (modal) {
      await modal.dismiss();
    }
  }

  /**
   * Check if max reminders (3) have been reached
   */
  canAddReminder(): boolean {
    return (this.type.reminders?.length || 0) < 3;
  }

  /**
   * Add a new reminder with validation
   */
  addReminder(hours: string | number) {
    const parsed = parseInt(String(hours), 10);

    if (isNaN(parsed) || parsed < 0) {
      Utils.showToast(translate('typeSettings.positiveInt'), 'danger');
      return;
    }

    if (!this.type.reminders) {
      this.type.reminders = [];
    }

    if (this.type.reminders.includes(parsed)) {
      Utils.showToast(translate('typeSettings.reminderExists'), 'warning');
      return;
    }

    if (this.type.reminders.length >= 3) {
      Utils.showToast(translate('typeSettings.max3'), 'danger');
      return;
    }

    this.type.reminders.push(parsed);
    this.type.reminders.sort((a, b) => a - b);
  }

  /**
   * Remove a reminder by index
   */
  removeReminder(index: number) {
    if (this.type.reminders) {
      this.type.reminders.splice(index, 1);
    }
  }

  /**
   * Get formatted reminder display text
   */
  getFormattedReminder(hours: number): string {
    if (hours === 0) {
      return translate('typeSettings.sameTime');
    } else if (hours < 24) {
      return translate('typeSettings.hoursBeforeN', { count: hours });
    } else {
      return translate('typeSettings.daysBeforeN', { count: Math.floor(hours / 24) });
    }
  }

  // ========== ANMELDEFELDER METHODS ==========

  public newRegField: Partial<RegistrationField> = {};
  public newRegFieldOptionsText = '';

  addRegistrationField(): void {
    if (!this.newRegField.label?.trim()) {
      Utils.showToast(translate('typeSettings.enterFieldLabel'), 'warning');
      return;
    }
    if (!this.newRegField.type) {
      Utils.showToast(translate('typeSettings.selectFieldType'), 'warning');
      return;
    }
    if (this.newRegField.type === 'select' || this.newRegField.type === 'multi_select') {
      const opts = this.newRegFieldOptionsText.split(',').map(o => o.trim()).filter(Boolean);
      if (opts.length < 2) {
        Utils.showToast(translate('typeSettings.twoOptions'), 'warning');
        return;
      }
      this.newRegField.options = opts;
    }
    if (!this.type.registration_fields) {
      this.type.registration_fields = [];
    }
    this.type.registration_fields.push({
      id: crypto.randomUUID(),
      label: this.newRegField.label.trim(),
      type: this.newRegField.type as RegistrationFieldType,
      options: this.newRegField.options,
    });
    this.newRegField = {};
    this.newRegFieldOptionsText = '';
  }

  removeRegistrationField(index: number, slider: any): void {
    slider.close();
    if (this.type.registration_fields) {
      this.type.registration_fields.splice(index, 1);
    }
  }

  getRegFieldTypeLabel(type: RegistrationFieldType): string {
    const labels: Record<RegistrationFieldType, string> = {
      text: translate('typeSettings.text'),
      boolean: translate('typeSettings.yesNo'),
      select: translate('typeSettings.single'),
      multi_select: translate('typeSettings.multi'),
    };
    return labels[type] ?? type;
  }

  // ========== CHECKLIST METHODS ==========

  /**
   * Check if a deadline value is one of the preset options
   */
  isPresetDeadline(hours: number | null): boolean {
    if (hours === null || hours === -1) {return true;}
    return CHECKLIST_DEADLINE_OPTIONS.some(opt => opt.hours === hours);
  }

  /**
   * Add a new checklist item
   */
  addChecklistItem(): void {
    if (!this.newChecklistText?.trim()) {
      Utils.showToast(translate('typeSettings.enterTodo'), 'warning');
      return;
    }

    if (!this.type.checklist) {
      this.type.checklist = [];
    }

    // Determine the actual deadline hours
    let deadlineHours: number | null = this.newChecklistDeadline;
    if (this.newChecklistDeadline === -1 && this.customChecklistDeadline) {
      deadlineHours = this.customChecklistDeadline;
    } else if (this.newChecklistDeadline === -1) {
      deadlineHours = null;
    }

    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: this.newChecklistText.trim(),
      deadlineHours,
    };

    this.type.checklist.push(newItem);
    this.newChecklistText = '';
    this.newChecklistDeadline = null;
    this.customChecklistDeadline = null;
  }

  /**
   * Remove a checklist item by index
   */
  removeChecklistItem(index: number, slider?: IonItemSliding): void {
    slider?.close();
    if (this.type.checklist) {
      this.type.checklist.splice(index, 1);
    }
  }

  /**
   * Edit a checklist item
   */
  async editChecklistItem(item: ChecklistItem, slider?: IonItemSliding): Promise<void> {
    slider?.close();

    const alert = await this.alertController.create({
      header: translate('typeSettings.editTodo'),
      inputs: [
        {
          type: 'text',
          name: 'text',
          value: item.text,
          placeholder: translate('typeSettings.todoTextPh'),
        },
      ],
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel',
        },
        {
          text: translate('common.save'),
          handler: (data) => {
            if (data.text?.trim()) {
              item.text = data.text.trim();
            }
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Get formatted deadline display text for checklist
   */
  getChecklistDeadlineText(hours: number | null): string {
    if (hours === null) {
      return translate('typeSettings.noDeadline');
    }
    return this.getFormattedReminder(hours);
  }

  /**
   * Handle checklist item reordering
   */
  handleChecklistReorder(ev: CustomEvent<ItemReorderEventDetail>): void {
    if (this.type.checklist) {
      ev.detail.complete(this.type.checklist);
    }
  }
}
