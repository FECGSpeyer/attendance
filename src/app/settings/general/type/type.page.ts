import { Component, HostListener, Input, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonItemSliding, IonModal, IonPopover, IonRouterOutlet, ItemReorderEventDetail, ModalController, NavController } from '@ionic/angular';
import dayjs from 'dayjs';
import { DataService } from 'src/app/services/data.service';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus, CHECKLIST_DEADLINE_OPTIONS } from 'src/app/utilities/constants';
import { AttendanceType, ChecklistItem, FieldSelection, Plan } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
    selector: 'app-type',
    templateUrl: './type.page.html',
    styleUrls: ['./type.page.scss'],
    standalone: false
})
export class TypePage implements OnInit {
  @Input() isNew: boolean;
  public type: AttendanceType;
  public isGeneral: boolean = false;
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
  public newChecklistText: string = '';
  public newChecklistDeadline: number | null = null;
  public customChecklistDeadline: number | null = null;

  private originalType: string = '';  // JSON string of original type for comparison

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

      this.type = {
        ...existingType,
        default_plan: existingType.default_plan ? { ...existingType.default_plan } : undefined
      };

      if (!this.type.default_plan?.fields) {
        this.type.default_plan = { ...this.defaultPlan };
      }
    }

    this.additionalFieldFilter = this.db.tenant().additional_fields.find(field => field.id === this.type.additional_fields_filter?.key) ? this.type.additional_fields_filter?.key ?? null : null;

    // Store original state for change detection
    this.originalType = JSON.stringify(this.type);
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    if (!this.type || this.isNew) return false;
    return JSON.stringify(this.type) !== this.originalType;
  }

  /**
   * Mark current state as saved (update original)
   */
  private markAsSaved(): void {
    this.originalType = JSON.stringify(this.type);
  }

  /**
   * Navigate back with unsaved changes check
   */
  async navigateBack(): Promise<void> {
    if (this.hasUnsavedChanges()) {
      const shouldLeave = await this.confirmUnsavedChanges();
      if (!shouldLeave) return;
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
        header: 'Ungespeicherte Änderungen',
        message: 'Du hast ungespeicherte Änderungen. Möchtest du sie speichern bevor du die Seite verlässt?',
        buttons: [
          {
            text: 'Abbrechen',
            role: 'cancel',
            handler: () => resolve(false)
          },
          {
            text: 'Verwerfen',
            role: 'destructive',
            handler: () => resolve(true)
          },
          {
            text: 'Speichern',
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
      Utils.showToast("Anwesenheitstyp erfolgreich aktualisiert", "success");
    } catch (error) {
      Utils.showToast("Fehler beim Aktualisieren des Anwesenheitstyps", "danger");
    }
  }

  async createType() {
    if (!this.validate()) {
      return;
    }

    try {
      this.type = await this.db.addAttendanceType(this.type);
      Utils.showToast("Anwesenheitstyp erfolgreich erstellt", "success");
      this.dismiss();
    } catch (error) {
      Utils.showToast("Fehler beim Erstellen des Anwesenheitstyps", "danger");
    }
  }

  validate(): boolean {
    if (!this.type.name || this.type.name.trim().length === 0) {
      Utils.showToast("Bitte einen Namen für den Anwesenheitstyp eingeben.", "danger");
      return false;
    } else if (this.type.available_statuses.length === 1) {
      Utils.showToast("Bitte mindestens zwei verfügbare Anwesenheitsstatus auswählen.", "danger");
      return false;
    }

    return true;
  }

  async deleteType() {
    const alert = await this.alertController.create({
      header: 'Anwesenheitstyp löschen',
      message: `Möchtest du den Anwesenheitstyp "${this.type.name}" wirklich löschen? Alle Anwesenheiten dieses Typs werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`,
      buttons: [{
        text: "Abbrechen",
      }, {
        text: "Löschen",
        role: "destructive",
        handler: async () => {
          try {
            await this.db.deleteAttendanceType(this.type.id);
            Utils.showToast("Anwesenheitstyp erfolgreich gelöscht", "success");
            this.router.navigate(['/tabs/settings/general/types']);
          } catch (error) {
            Utils.showToast("Fehler beim Löschen des Anwesenheitstyps", "danger");
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
        header: 'Änderungen verwerfen?',
        message: 'Du hast bereits Daten eingegeben. Möchtest du diese wirklich verwerfen?',
        buttons: [
          {
            text: 'Abbrechen',
            role: 'cancel'
          },
          {
            text: 'Verwerfen',
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
    let minutesToAdd: number = 0;
    let currentIndex: number = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.type.default_plan.fields[currentIndex].time);
      currentIndex++;
    }

    const time: dayjs.Dayjs = dayjs(this.type.start_time).isValid() ? dayjs(this.type.start_time) : dayjs().hour(Number(this.type.start_time.substring(0, 2))).minute(Number(this.type.start_time.substring(3, 5)));
    return `${time.add(minutesToAdd, "minute").format("HH:mm")} ${field.conductor ? `| ${field.conductor}` : ""}`;
  }

  async addExtraField(popover: IonPopover) {
    await popover.dismiss();

    const alert = await this.alertController.create({
      header: 'Feld hinzufügen',
      inputs: [{
        type: "textarea",
        name: "field",
        placeholder: "Freitext eingeben..."
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Hinzufügen",
        handler: (evt: any) => {
          this.type.default_plan.fields.push({
            id: evt.field,
            name: evt.field,
            time: "20",
          });

          this.calculateEnd();
        }
      }]
    });

    await alert.present();
  }

  addSongPlaceholder(popover: IonPopover) {
    popover.dismiss();

    const numberOfSongs = this.type.default_plan.fields.filter(f => f.id?.startsWith("song-placeholder-")).length;

    this.type.default_plan.fields.push({
      id: `song-placeholder-${numberOfSongs + 1}`,
      name: `Werk Platzhalter ${numberOfSongs + 1}`,
      time: "20",
    });

    this.calculateEnd();
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
    const alert = await this.alertController.create({
      header: 'Feld bearbeiten',
      inputs: [{
        label: "Programmpunkt",
        type: "text",
        name: "field",
        value: clone.name,
        placeholder: "Programmpunkt eingeben..."
      }, {
        label: "Ausführender",
        type: "text",
        name: "conductor",
        value: clone.conductor,
        placeholder: "Ausführenden eingeben..."
      }],
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Updaten",
        handler: (evt: any) => {
          if (!evt.field) {
            alert.message = "Bitte einen Programmpunkt eingeben.";
            return false;
          }
          field.name = evt.field;
          field.conductor = evt.conductor;
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

    for (let field of this.type.default_plan.fields) {
      currentTime = currentTime.add(parseInt(field.time), "minutes");
    }

    this.end = currentTime.format("YYYY-MM-DDTHH:mm");
  }

  onAvailableStatusesChanged() {
    if (!this.type.available_statuses.includes(this.type.default_status)) {
      this.type.default_status = AttendanceStatus.Present;
    }
  }

  areSelectFieldsAvailable(): boolean {
    return Boolean(this.db.tenant().additional_fields?.length && this.db.tenant().additional_fields.find(field => field.type ===
      "select"));
  }

  onAdditionalFieldFilterChanged() {
    if (this.additionalFieldFilter) {
      this.type.additional_fields_filter = {
        key: this.additionalFieldFilter,
        option: this.db.tenant().additional_fields.find(field => field.id === this.additionalFieldFilter)?.options?.[0]
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
      Utils.showToast("Bitte geben Sie eine positive Ganzzahl ein", "danger");
      return;
    }

    if (!this.type.reminders) {
      this.type.reminders = [];
    }

    if (this.type.reminders.includes(parsed)) {
      Utils.showToast("Diese Erinnerung existiert bereits", "warning");
      return;
    }

    if (this.type.reminders.length >= 3) {
      Utils.showToast("Maximal 3 Erinnerungen pro Typ möglich", "danger");
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
      return 'Zur gleichen Zeit';
    } else if (hours === 1) {
      return '1 Stunde vorher';
    } else if (hours < 24) {
      return `${hours} Stunden vorher`;
    } else if (hours === 24) {
      return '1 Tag vorher';
    } else {
      return `${Math.floor(hours / 24)} Tage vorher`;
    }
  }

  // ========== CHECKLIST METHODS ==========

  /**
   * Check if a deadline value is one of the preset options
   */
  isPresetDeadline(hours: number | null): boolean {
    if (hours === null || hours === -1) return true;
    return CHECKLIST_DEADLINE_OPTIONS.some(opt => opt.hours === hours);
  }

  /**
   * Add a new checklist item
   */
  addChecklistItem(): void {
    if (!this.newChecklistText?.trim()) {
      Utils.showToast('Bitte einen Text für das To-Do eingeben', 'warning');
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
      header: 'To-Do bearbeiten',
      inputs: [
        {
          type: 'text',
          name: 'text',
          value: item.text,
          placeholder: 'To-Do Text...',
        },
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
        },
        {
          text: 'Speichern',
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
      return 'Keine Deadline';
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
