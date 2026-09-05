import { Component, HostListener, OnInit } from '@angular/core';
import { AlertController, IonModal, NavController } from '@ionic/angular/lazy';
import { format, parseISO } from 'date-fns';
import dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus, DEFAULT_ABSENCE_REASONS, DEFAULT_LATE_REASONS, DEFAULT_SHOW_ALL_ATTENDANCES_INFO_TEXT, Role } from 'src/app/utilities/constants';
import { AttendanceType, Church, CriticalRule, CriticalRuleOperator, CriticalRulePeriodType, CriticalRuleThresholdType } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-general',
  templateUrl: './general.page.html',
  styleUrls: ['./general.page.scss'],
  standalone: false
})
export class GeneralPage implements OnInit {
  public holidayStates = [
    { name: 'Baden-Württemberg', code: 'BW' },
    { name: 'Bayern', code: 'BY' },
    { name: 'Berlin', code: 'BE' },
    { name: 'Brandenburg', code: 'BB' },
    { name: 'Bremen', code: 'HB' },
    { name: 'Hamburg', code: 'HH' },
    { name: 'Hessen', code: 'HE' },
    { name: 'Mecklenburg-Vorpommern', code: 'MV' },
    { name: 'Niedersachsen', code: 'NI' },
    { name: 'Nordrhein-Westfalen', code: 'NW' },
    { name: 'Rheinland-Pfalz', code: 'RP' },
    { name: 'Saarland', code: 'SL' },
    { name: 'Sachsen', code: 'SN' },
    { name: 'Sachsen-Anhalt', code: 'ST' },
    { name: 'Schleswig-Holstein', code: 'SH' },
    { name: 'Thüringen', code: 'TH' },
  ];
  public practiceStart: string;
  public practiceEnd: string;
  public shortName = '';
  public longName = '';
  public maintainTeachers = false;
  public showHolidays = false;
  public region = 'RP';
  public attDateString: string = format(new Date(), 'dd.MM.yyyy');
  public attDate: string = new Date().toISOString();
  public parentsEnabled = false;
  public showMembersList = false;
  public isOrchestra = false;
  public isSuperAdmin = false;
  public isGeneral = false;
  public max: string = new Date().toISOString();
  public churches: Church[] = [];
  public duplicateGroups: { target: Church; duplicates: Church[] }[] = [];
  public songSharingEnabled = false;
  public registerAllowed = false;
  public autoApproveRegistrations = false;
  public registerFields: { key: string; label: string; disabled: boolean }[] = [
    { key: 'picture', label: 'Passbild', disabled: false },
    { key: 'firstName', label: 'Vorname', disabled: true },
    { key: 'lastName', label: 'Nachname', disabled: true },
    { key: 'group', label: 'Gruppe', disabled: true },
    { key: 'birthDate', label: 'Geburtsdatum', disabled: false },
    { key: 'phone', label: 'Handynummer', disabled: false },
  ];
  public selectedRegisterFields: string[] = ['firstName', 'lastName', 'birthDate', 'group'];

  // Shift worker config
  public shiftExcusedAsPresent = false;

  // Show all attendances config
  public showAllAttendances = false;
  public showAllAttendancesInfoText = '';

  // Absence and late reasons
  public absenceReasons: string[] = [];
  public lateReasons: string[] = [];

  // Critical rules
  public criticalRules: CriticalRule[] = [];
  public attendanceTypes: AttendanceType[] = [];
  public newCriticalRule: CriticalRule = this.getEmptyCriticalRule();
  public AttendanceStatus = AttendanceStatus;
  public CriticalRuleThresholdType = CriticalRuleThresholdType;
  public CriticalRuleOperator = CriticalRuleOperator;
  public CriticalRulePeriodType = CriticalRulePeriodType;

  // Change tracking
  private originalState = '';

  // Browser/PWA: Warn before closing tab with unsaved changes
  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) {
      $event.returnValue = true;
    }
  }

  constructor(
    public db: DbService,
    private alertController: AlertController,
    private navController: NavController,
  ) {

  }

  async ngOnInit() {
    this.shortName = this.db.tenant().shortName;
    this.longName = this.db.tenant().longName;
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.region = this.db.tenant().region;
    this.showHolidays = this.db.tenant().showHolidays;
    this.practiceStart = this.db.tenant().practiceStart || '18:00';
    this.practiceEnd = this.db.tenant().practiceEnd || '20:00';
    this.parentsEnabled = this.db.tenant().parents || false;
    this.showMembersList = this.db.tenant().showMembersList || false;
    this.attDate = this.db.getCurrentAttDate();
    this.attDateString = format(new Date(this.attDate), 'dd.MM.yyyy');
    this.isOrchestra = this.db.tenant().type === 'orchestra';
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.isGeneral = this.db.tenant().type === 'general';
    this.songSharingEnabled = !!this.db.tenant().song_sharing_id;
    this.registerAllowed = !!this.db.tenant().register_id;
    this.autoApproveRegistrations = this.db.tenant().auto_approve_registrations || false;
    this.shiftExcusedAsPresent = this.db.tenant().shift_excused_as_present || false;
    this.showAllAttendances = this.db.tenant().show_all_attendances || false;
    this.showAllAttendancesInfoText = this.db.tenant().show_all_attendances_info_text
      || DEFAULT_SHOW_ALL_ATTENDANCES_INFO_TEXT;

    if (this.db.tenant().additional_fields?.length) {
      this.registerFields = this.registerFields.concat(this.db.tenant().additional_fields.map(field => ({
        key: field.id,
        label: field.name,
        disabled: false,
      })));
    }
    this.selectedRegisterFields = this.db.tenant().registration_fields?.length ? this.db.tenant().registration_fields : this.registerFields.filter(f => f.disabled).map(f => f.key);

    // Load absence and late reasons (use defaults if not configured)
    this.absenceReasons = this.db.tenant().absence_reasons?.length
      ? [...this.db.tenant().absence_reasons]
      : [...DEFAULT_ABSENCE_REASONS];
    this.lateReasons = this.db.tenant().late_reasons?.length
      ? [...this.db.tenant().late_reasons]
      : [...DEFAULT_LATE_REASONS];

    // Migrate legacy rules: add period_type if missing
    this.criticalRules = (this.db.tenant().critical_rules ?? []).map(rule => ({
      ...rule,
      period_type: rule.period_type ?? CriticalRulePeriodType.DAYS,
    }));

    this.loadAttendanceTypes();

    if (this.db.isBeta()) {
      this.churches = await this.db.getChurches();
      this.findDuplicates();
    }

    // Store original state for change detection
    this.originalState = this.getCurrentStateJson();
  }

  /**
   * Get current state as JSON string for comparison
   */
  private getCurrentStateJson(): string {
    return JSON.stringify({
      shortName: this.shortName,
      longName: this.longName,
      maintainTeachers: this.maintainTeachers,
      region: this.region,
      showHolidays: this.showHolidays,
      practiceStart: this.practiceStart,
      practiceEnd: this.practiceEnd,
      parentsEnabled: this.parentsEnabled,
      showMembersList: this.showMembersList,
      attDate: this.attDate,
      songSharingEnabled: this.songSharingEnabled,
      registerAllowed: this.registerAllowed,
      autoApproveRegistrations: this.autoApproveRegistrations,
      selectedRegisterFields: this.selectedRegisterFields,
      criticalRules: this.criticalRules,
      shiftExcusedAsPresent: this.shiftExcusedAsPresent,
      showAllAttendances: this.showAllAttendances,
      showAllAttendancesInfoText: this.showAllAttendancesInfoText,
    });
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.getCurrentStateJson() !== this.originalState;
  }

  /**
   * Mark current state as saved
   */
  private markAsSaved(): void {
    this.originalState = this.getCurrentStateJson();
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
              await this.saveGeneralSettings();
              resolve(true);
            }
          }
        ]
      });
      await alert.present();
    });
  }

  loadAttendanceTypes() {
    this.attendanceTypes = [...this.db.attendanceTypes()];
  }

  getEmptyCriticalRule(): CriticalRule {
    return {
      id: '',
      name: '',
      attendance_type_ids: [],
      statuses: [],
      threshold_type: CriticalRuleThresholdType.COUNT,
      threshold_value: 3,
      period_type: CriticalRulePeriodType.DAYS,
      period_days: 30,
      operator: CriticalRuleOperator.OR,
    };
  }

  getPeriodTypeName(periodType: CriticalRulePeriodType): string {
    switch (periodType) {
      case CriticalRulePeriodType.DAYS:
        return 'Letzte X Tage';
      case CriticalRulePeriodType.SEASON:
        return 'Seit Saisonbeginn';
      case CriticalRulePeriodType.ALL_TIME:
        return 'Gesamte Historie';
      default:
        return 'Unbekannt';
    }
  }

  async saveGeneralSettings() {
    if (!this.longName?.trim()) {
      Utils.showToast('Der Gruppenname darf nicht leer sein.', 'danger');
      return;
    }
    if (!this.shortName?.trim()) {
      Utils.showToast('Der Kurzname darf nicht leer sein.', 'danger');
      return;
    }

    let song_sharing_id = this.songSharingEnabled ? this.db.tenant().song_sharing_id : null;
    if (this.songSharingEnabled && !this.db.tenant().song_sharing_id) {
      song_sharing_id = crypto.randomUUID();
    }

    let register_id = this.registerAllowed ? this.db.tenant().register_id : null;
    if (this.registerAllowed && !this.db.tenant().register_id) {
      register_id = crypto.randomUUID();
    }

    const loading = await Utils.getLoadingElement(999999, 'Einstellungen werden gespeichert...');
    await loading.present();

    try {
      // Filter out empty reasons
      const filteredAbsenceReasons = this.absenceReasons.filter(r => r && r.trim().length > 0);
      const filteredLateReasons = this.lateReasons.filter(r => r && r.trim().length > 0);

      await this.db.updateTenantData({
        practiceStart: this.practiceStart,
        practiceEnd: this.practiceEnd,
        seasonStart: this.attDate,
        shortName: this.shortName,
        longName: this.longName,
        parents: this.parentsEnabled,
        showMembersList: this.showMembersList,
        region: this.region,
        maintainTeachers: this.maintainTeachers,
        showHolidays: this.showHolidays,
        song_sharing_id: song_sharing_id || null,
        register_id: register_id || null,
        auto_approve_registrations: this.registerAllowed ? this.autoApproveRegistrations : false,
        registration_fields: this.registerAllowed ? this.selectedRegisterFields : [],
        critical_rules: this.criticalRules,
        shift_excused_as_present: this.shiftExcusedAsPresent,
        show_all_attendances: this.showAllAttendances,
        show_all_attendances_info_text: this.showAllAttendances
          ? (this.showAllAttendancesInfoText?.trim() || DEFAULT_SHOW_ALL_ATTENDANCES_INFO_TEXT)
          : null,
        absence_reasons: filteredAbsenceReasons.length > 0 ? filteredAbsenceReasons : null,
        late_reasons: filteredLateReasons.length > 0 ? filteredLateReasons : null,
      });

      // Evaluate critical rules for all players after saving
      try {
        await this.db.getSupabase().functions.invoke('evaluate-critical-rules');
      } catch (e) {
        console.warn('Could not trigger critical rules evaluation:', e);
      }

      this.markAsSaved();
      await loading.dismiss();
      Utils.showToast('Einstellungen gespeichert', 'success');

      const alert = await this.alertController.create({
        header: 'Einstellungen gespeichert',
        message: 'Die Einstellungen wurden erfolgreich gespeichert. Bitte lade die Seite neu, um die Änderungen zu sehen.',
        buttons: [{
          text: 'Abbrechen'
        }, {
          text: 'Neu laden',
          handler: () => {
            window?.location?.reload();
          }
        }]
      });

      await alert.present();
    } catch (error) {
      await loading.dismiss();
      Utils.showToast('Fehler beim Aktualisieren der Einstellungen', 'danger');
    }
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  onAttDateChange(value: string | string[], dateModal: IonModal) {
    if (parseInt(this.attDateString.substring(0, 2), 10) !== dayjs(this.attDate).date()) {
      dateModal.dismiss();
    }

    this.attDateString = this.formatDate(value as string);
  }

  getSongSharingLink(): string {
    return `https://attendix.de/${this.db.tenant().song_sharing_id}`;
  }

  copySongSharingLink() {
    navigator?.clipboard.writeText(this.getSongSharingLink());
    Utils.showToast('Der Link wurde in die Zwischenablage kopiert', 'success');
  }

  getRegisterLink(): string {
    return `https://attendix.de/register/${this.db.tenant().register_id}`;
  }

  copyRegisterLink() {
    navigator?.clipboard.writeText(this.getRegisterLink());
    Utils.showToast('Der Link wurde in die Zwischenablage kopiert', 'success');
  }

  // Critical rule methods
  getStatusName(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Present:
        return 'Anwesend';
      case AttendanceStatus.Absent:
        return 'Abwesend';
      case AttendanceStatus.Excused:
        return 'Entschuldigt';
      case AttendanceStatus.Late:
        return 'Verspätet';
      case AttendanceStatus.LateExcused:
        return 'Verspätet (entsch.)';
      case AttendanceStatus.Neutral:
        return 'Neutral';
      default:
        return 'Unbekannt';
    }
  }

  getAvailableStatuses(): AttendanceStatus[] {
    return [
      AttendanceStatus.Present,
      AttendanceStatus.Absent,
      AttendanceStatus.Excused,
      AttendanceStatus.Late,
      AttendanceStatus.LateExcused,
    ];
  }

  addCriticalRule(modal: IonModal) {
    if (this.newCriticalRule.statuses.length === 0) {
      Utils.showToast('Bitte wähle mindestens einen Status aus.', 'danger');
      return;
    }

    if (this.newCriticalRule.threshold_value <= 0) {
      Utils.showToast('Der Schwellenwert muss größer als 0 sein.', 'danger');
      return;
    }

    if (this.newCriticalRule.period_type === CriticalRulePeriodType.DAYS && (!this.newCriticalRule.period_days || this.newCriticalRule.period_days <= 0)) {
      Utils.showToast('Der Zeitraum muss größer als 0 sein.', 'danger');
      return;
    }

    this.newCriticalRule.id = crypto.randomUUID();

    // Clean up period_days if not needed
    if (this.newCriticalRule.period_type !== CriticalRulePeriodType.DAYS) {
      delete this.newCriticalRule.period_days;
    }

    this.criticalRules.push({ ...this.newCriticalRule });
    this.newCriticalRule = this.getEmptyCriticalRule();
    modal.dismiss();
  }

  async removeCriticalRule(index: number) {
    const alert = await this.alertController.create({
      header: 'Regel löschen?',
      message: 'Möchtest du diese Regel wirklich löschen?',
      buttons: [{
        text: 'Abbrechen'
      }, {
        text: 'Löschen',
        handler: () => {
          this.criticalRules.splice(index, 1);
        }
      }]
    });

    await alert.present();
  }

  getCriticalRuleDescription(rule: CriticalRule): string {
    const statusNames = rule.statuses.map(s => this.getStatusName(s)).join(', ');
    const typeNames = rule.attendance_type_ids.length > 0
      ? this.attendanceTypes.filter(t => rule.attendance_type_ids.includes(t.id)).map(t => t.name).join(', ')
      : 'Alle Typen';

    let periodText: string;
    switch (rule.period_type) {
      case CriticalRulePeriodType.DAYS:
        periodText = `in ${rule.period_days} Tagen`;
        break;
      case CriticalRulePeriodType.SEASON:
        periodText = 'seit Saisonbeginn';
        break;
      case CriticalRulePeriodType.ALL_TIME:
        periodText = 'insgesamt';
        break;
      default:
        // Fallback for legacy rules without period_type
        periodText = rule.period_days ? `in ${rule.period_days} Tagen` : 'insgesamt';
    }

    const thresholdSymbol = rule.threshold_type === CriticalRuleThresholdType.COUNT ? 'x' : '%';
    const namePrefix = rule.name ? `${rule.name}: ` : '';
    return `${namePrefix}${rule.threshold_value}${thresholdSymbol} ${statusNames} ${periodText} (${typeNames})`;
  }

  async openChurchInput() {
    const alert = await this.alertController.create({
      header: 'Gemeinde hinzufügen',
      inputs: [{
        type: 'text',
        name: 'name',
        placeholder: 'Name der Gemeinde',
      }],
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Hinzufügen',
        handler: async (data: { name: string }) => {
          if (data.name.length) {
            const loading = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createChurch(data.name);
              Utils.showToast('Die Gemeinde wurde erfolgreich hinzugefügt.', 'success');
              this.churches = await this.db.getChurches();
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, 'danger');
              await loading.dismiss();
            }
          } else {
            alert.message = 'Bitte gib gültige Werte ein.';
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  findDuplicates() {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
    const groups = new Map<string, Church[]>();

    for (const church of this.churches) {
      const key = normalize(church.name);
      if (!groups.has(key)) {groups.set(key, []);}
      groups.get(key).push(church);
    }

    this.duplicateGroups = [];
    for (const [, group] of groups) {
      if (group.length > 1) {
        this.duplicateGroups.push({
          target: group[0],
          duplicates: group.slice(1),
        });
      }
    }
  }

  async mergeChurch(target: Church, duplicate: Church) {
    const alert = await this.alertController.create({
      header: 'Gemeinden zusammenführen',
      message: `"${duplicate.name}" wird in "${target.name}" zusammengeführt. Alle Personen werden aktualisiert. Fortfahren?`,
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Zusammenführen',
        role: 'destructive',
        handler: async () => {
          const loading = await Utils.getLoadingElement(999999, 'Gemeinden werden zusammengeführt...');
          await loading.present();
          try {
            const count = await this.db.mergeChurches(target.id, duplicate.id);
            this.churches = await this.db.getChurches();
            this.findDuplicates();
            await loading.dismiss();
            Utils.showToast(`Zusammengeführt: ${count} Person(en) aktualisiert`, 'success');
          } catch (error) {
            await loading.dismiss();
            Utils.showToast('Fehler beim Zusammenführen', 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async mergeAllDuplicates() {
    const total = this.duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0);
    const alert = await this.alertController.create({
      header: 'Alle Duplikate zusammenführen',
      message: `${total} Duplikat(e) in ${this.duplicateGroups.length} Gruppe(n) werden zusammengeführt. Fortfahren?`,
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Alle zusammenführen',
        role: 'destructive',
        handler: async () => {
          const loading = await Utils.getLoadingElement(999999, 'Gemeinden werden zusammengeführt...');
          await loading.present();
          try {
            let totalUpdated = 0;
            for (const group of [...this.duplicateGroups]) {
              for (const dup of group.duplicates) {
                totalUpdated += await this.db.mergeChurches(group.target.id, dup.id);
              }
            }
            this.churches = await this.db.getChurches();
            this.findDuplicates();
            await loading.dismiss();
            Utils.showToast(`${totalUpdated} Person(en) aktualisiert, ${total} Duplikat(e) entfernt`, 'success');
          } catch (error) {
            await loading.dismiss();
            Utils.showToast('Fehler beim Zusammenführen', 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async renameChurch(church: Church) {
    const alert = await this.alertController.create({
      header: 'Gemeinde umbenennen',
      inputs: [{
        type: 'text',
        name: 'name',
        value: church.name,
        placeholder: 'Name der Gemeinde',
      }],
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Speichern',
        handler: async (data) => {
          const name = data.name?.trim();
          if (!name) {return;}
          try {
            await this.db.renameChurch(church.id, name);
            this.churches = await this.db.getChurches();
            this.findDuplicates();
            Utils.showToast('Gemeinde umbenannt', 'success');
          } catch {
            Utils.showToast('Fehler beim Umbenennen', 'danger');
          }
        }
      }]
    });
    await alert.present();
  }

  async mergeChurchManual(source: Church) {
    const targets = this.churches.filter(c => c.id !== source.id);
    const alert = await this.alertController.create({
      header: `"${source.name}" zusammenführen mit...`,
      inputs: targets.map((c, i) => ({
        type: 'radio' as const,
        label: c.name,
        value: c.id,
        checked: i === 0,
      })),
      buttons: [{
        text: 'Abbrechen',
      }, {
        text: 'Zusammenführen',
        handler: async (targetId: string) => {
          if (!targetId) {return;}
          const target = this.churches.find(c => c.id === targetId);
          const confirmAlert = await this.alertController.create({
            header: 'Bestätigen',
            message: `"${source.name}" wird gelöscht und alle Personen zu "${target.name}" verschoben. Fortfahren?`,
            buttons: [{
              text: 'Abbrechen',
            }, {
              text: 'Zusammenführen',
              role: 'destructive',
              handler: async () => {
                const loading = await Utils.getLoadingElement(999999, 'Gemeinden werden zusammengeführt...');
                await loading.present();
                try {
                  const count = await this.db.mergeChurches(targetId, source.id);
                  this.churches = await this.db.getChurches();
                  this.findDuplicates();
                  await loading.dismiss();
                  Utils.showToast(`Zusammengeführt: ${count} Person(en) aktualisiert`, 'success');
                } catch (error) {
                  await loading.dismiss();
                  Utils.showToast('Fehler beim Zusammenführen', 'danger');
                }
              }
            }]
          });
          await confirmAlert.present();
        }
      }]
    });
    await alert.present();
  }

  addAbsenceReason() {
    this.absenceReasons.push('');
  }

  removeAbsenceReason(index: number) {
    this.absenceReasons.splice(index, 1);
  }

  resetAbsenceReasons() {
    this.absenceReasons = [...DEFAULT_ABSENCE_REASONS];
  }

  addLateReason() {
    this.lateReasons.push('');
  }

  removeLateReason(index: number) {
    this.lateReasons.splice(index, 1);
  }

  resetLateReasons() {
    this.lateReasons = [...DEFAULT_LATE_REASONS];
  }
}
