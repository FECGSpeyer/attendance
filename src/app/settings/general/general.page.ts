import { Component, OnInit } from '@angular/core';
import { AlertController, IonModal } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus, FieldType, Role } from 'src/app/utilities/constants';
import { AttendanceType, CriticalRule, CriticalRuleOperator, CriticalRuleThresholdType, ExtraField, Organisation } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
    selector: 'app-general',
    templateUrl: './general.page.html',
    styleUrls: ['./general.page.scss'],
    standalone: false
})
export class GeneralPage implements OnInit {
  public holidayStates = [
    { name: "Baden-Württemberg", code: "BW" },
    { name: "Bayern", code: "BY" },
    { name: "Berlin", code: "BE" },
    { name: "Brandenburg", code: "BB" },
    { name: "Bremen", code: "HB" },
    { name: "Hamburg", code: "HH" },
    { name: "Hessen", code: "HE" },
    { name: "Mecklenburg-Vorpommern", code: "MV" },
    { name: "Niedersachsen", code: "NI" },
    { name: "Nordrhein-Westfalen", code: "NW" },
    { name: "Rheinland-Pfalz", code: "RP" },
    { name: "Saarland", code: "SL" },
    { name: "Sachsen", code: "SN" },
    { name: "Sachsen-Anhalt", code: "ST" },
    { name: "Schleswig-Holstein", code: "SH" },
    { name: "Thüringen", code: "TH" },
  ];
  public practiceStart: string;
  public practiceEnd: string;
  public shortName: string = '';
  public longName: string = '';
  public maintainTeachers: boolean = false;
  public showHolidays: boolean = false;
  public region: string = 'RP';
  public attDateString: string = format(new Date(), 'dd.MM.yyyy');
  public attDate: string = new Date().toISOString();
  public parentsEnabled: boolean = false;
  public isOrchestra: boolean = false;
  public isSuperAdmin: boolean = false;
  public isGeneral: boolean = false;
  public max: string = new Date().toISOString();
  public songSharingEnabled: boolean = false;
  public newExtraField: ExtraField = {
    id: '',
    name: '',
    type: FieldType.TEXT,
    defaultValue: '',
    options: [],
  };
  public fieldTypes = FieldType;
  public extraFields: ExtraField[] = [];
  public registerAllowed: boolean = false;
  public autoApproveRegistrations: boolean = false;
  public registerFields: { key: string, label: string, disabled: boolean }[] = [
    { key: 'picture', label: 'Passbild', disabled: false },
    { key: 'firstName', label: 'Vorname', disabled: true },
    { key: 'lastName', label: 'Nachname', disabled: true },
    { key: 'group', label: 'Gruppe', disabled: true },
    { key: 'birthDate', label: 'Geburtsdatum', disabled: false },
    { key: 'phone', label: 'Handynummer', disabled: false },
  ];
  public selectedRegisterFields: string[] = ['firstName', 'lastName', 'birthDate', 'group'];

  // Critical rules
  public criticalRules: CriticalRule[] = [];
  public attendanceTypes: AttendanceType[] = [];
  public newCriticalRule: CriticalRule = this.getEmptyCriticalRule();
  public AttendanceStatus = AttendanceStatus;
  public CriticalRuleThresholdType = CriticalRuleThresholdType;
  public CriticalRuleOperator = CriticalRuleOperator;

  constructor(
    public db: DbService,
    private alertController: AlertController,
  ) {

  }

  ngOnInit() {
    this.shortName = this.db.tenant().shortName;
    this.longName = this.db.tenant().longName;
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.region = this.db.tenant().region;
    this.showHolidays = this.db.tenant().showHolidays;
    this.practiceStart = this.db.tenant().practiceStart || '18:00';
    this.practiceEnd = this.db.tenant().practiceEnd || '20:00';
    this.parentsEnabled = this.db.tenant().parents || false;
    this.attDate = this.db.getCurrentAttDate();
    this.attDateString = format(new Date(this.attDate), 'dd.MM.yyyy');
    this.isOrchestra = this.db.tenant().type === 'orchestra';
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.isGeneral = this.db.tenant().type === 'general';
    this.songSharingEnabled = !!this.db.tenant().song_sharing_id;
    this.registerAllowed = !!this.db.tenant().register_id;
    this.autoApproveRegistrations = this.db.tenant().auto_approve_registrations || false;

    if (this.db.tenant().additional_fields?.length) {
      this.registerFields = this.registerFields.concat(this.db.tenant().additional_fields.map(field => ({
        key: field.id,
        label: field.name,
        disabled: false,
      })));
    }
    this.selectedRegisterFields = this.db.tenant().registration_fields?.length ? this.db.tenant().registration_fields : this.registerFields.filter(f => f.disabled).map(f => f.key);
    this.extraFields = [...this.db.tenant().additional_fields ?? []];
    this.criticalRules = [...this.db.tenant().critical_rules ?? []];
    this.loadAttendanceTypes();
  }

  loadAttendanceTypes() {
    this.attendanceTypes = [...this.db.attendanceTypes()];
  }

  getEmptyCriticalRule(): CriticalRule {
    return {
      id: '',
      attendance_type_ids: [],
      statuses: [],
      threshold_type: CriticalRuleThresholdType.COUNT,
      threshold_value: 3,
      period_days: 30,
      operator: CriticalRuleOperator.OR,
    };
  }

  async saveGeneralSettings() {
    let song_sharing_id = this.songSharingEnabled ? this.db.tenant().song_sharing_id : null;
    if (this.songSharingEnabled && !this.db.tenant().song_sharing_id) {
      song_sharing_id = crypto.randomUUID();
    }

    let register_id = this.registerAllowed ? this.db.tenant().register_id : null;
    if (this.registerAllowed && !this.db.tenant().register_id) {
      register_id = crypto.randomUUID();
    }

    try {
      await this.db.updateTenantData({
        practiceStart: this.practiceStart,
        practiceEnd: this.practiceEnd,
        seasonStart: this.attDate,
        shortName: this.shortName,
        longName: this.longName,
        parents: this.parentsEnabled,
        region: this.region,
        maintainTeachers: this.maintainTeachers,
        showHolidays: this.showHolidays,
        song_sharing_id: song_sharing_id || null,
        additional_fields: this.extraFields,
        register_id: register_id || null,
        auto_approve_registrations: this.registerAllowed ? this.autoApproveRegistrations : false,
        registration_fields: this.registerAllowed ? this.selectedRegisterFields : [],
        critical_rules: this.criticalRules,
      });
      Utils.showToast("Einstellungen gespeichert", "success");

      const alert = await this.alertController.create({
        header: 'Einstellungen gespeichert',
        message: 'Die Einstellungen wurden erfolgreich gespeichert. Bitte lade die Seite neu, um die Änderungen zu sehen.',
        buttons: [{
          text: "Abbrechen"
        }, {
          text: "Neu laden",
          handler: () => {
            window?.location?.reload();
          }
        }]
      });

      await alert.present();
    } catch (error) {
      Utils.showToast("Fehler beim Aktualisieren der Einstellungen", "danger");
    }
  }

  async openOrganisationAlert() {
    const organisations = await this.db.getOrganisationsFromUser();

    if (organisations.length) {
      const alert = await this.alertController.create({
        header: 'Organisation auswählen',
        inputs: organisations.map((org: Organisation, index: number) => ({
          type: 'radio',
          checked: index === 0,
          label: org.name,
          value: org,
        })),
        buttons: [{
          text: "Abbrechen",
        }, {
          text: "Auswählen",
          handler: async (data: Organisation) => {
            if (data) {
              const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
              loading.present();
              try {
                await this.db.linkTenantToOrganisation(this.db.tenant().id, data);
                Utils.showToast("Die Organisation wurde erfolgreich ausgewählt.", "success");
                await loading.dismiss();
              } catch (error) {
                Utils.showToast(error.message, "danger");
                await loading.dismiss();
              }
            } else {
              alert.message = "Bitte wähle eine Organisation aus.";
              return false;
            }
          }
        }, {
          text: "Neue Organisation erstellen",
          handler: async () => {
            alert.dismiss();
            this.openCreateOrganisationAlert();
          }
        }]
      });

      await alert.present();
      return;
    }

    this.openCreateOrganisationAlert();
  }

  async openCreateOrganisationAlert() {
    const alert = await this.alertController.create({
      header: 'Organisation erstellen',
      inputs: [{
        type: "text",
        name: "name",
        placeholder: "Name eingeben...",
      }],
      buttons: [{
        text: "Abbrechen",
      }, {
        text: "Hinzufügen",
        handler: async (data: { name: string }) => {
          if (data.name.length) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createOrganisation(data.name);
              Utils.showToast("Die Organisation wurde erfolgreich erstellt.", "success");
              await loading.dismiss();
            } catch (error) {
              Utils.showToast(error.message, "danger");
              await loading.dismiss();
            }
          } else {
            alert.message = "Bitte gib gültige Werte ein.";
            return false;
          }
        }
      }]
    });

    await alert.present();
  }

  async deleteOrganisation() {
    if (!this.db.organisation()) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Organisation von Instanz trennen?',
      message: `Möchtest du die Organisation '${this.db.organisation().name}' wirklich von der Instanz trennen? Dies kann nicht rückgängig gemacht werden!`,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Trennen",
        handler: async () => {
          await this.db.unlinkTenantFromOrganisation(this.db.organisation().id);
          this.db.organisation.set(null);
          Utils.showToast("Die Organisation wurde erfolgreich von der Instanz getrennt.", "success");
        }
      }]
    });

    await alert.present();
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
    return `${window.location.origin}/${this.db.tenant().song_sharing_id}`;
  }

  copySongSharingLink() {
    navigator?.clipboard.writeText(this.getSongSharingLink());
    Utils.showToast("Der Link wurde in die Zwischenablage kopiert", "success");
  }

  getRegisterLink(): string {
    return `${window.location.origin}/register/${this.db.tenant().register_id}`;
  }

  copyRegisterLink() {
    navigator?.clipboard.writeText(this.getRegisterLink());
    Utils.showToast("Der Link wurde in die Zwischenablage kopiert", "success");
  }

  addExtraField(modal: IonModal) {
    if (this.newExtraField.name.trim().length === 0) {
      Utils.showToast("Bitte gib einen gültigen Namen für das Zusatzfeld ein.", "danger");
      return;
    }

    if (this.newExtraField.type === FieldType.BFECG_CHURCH) {
      this.newExtraField.id = 'bfecg_church';
    } else {
      // id should have no spaces and be lowercase and remove special characters
      this.newExtraField.id = this.newExtraField.name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }

    if (this.extraFields.find((f) => f.id === this.newExtraField.id)) {
      Utils.showToast("Ein Zusatzfeld mit dieser ID existiert bereits. Bitte wähle einen anderen Namen.", "danger");
      return;
    }

    if (this.newExtraField.type === FieldType.SELECT) {
      if (!this.newExtraField.options || this.newExtraField.options.length === 0) {
        Utils.showToast("Bitte füge mindestens eine Option für das Auswahlfeld hinzu.", "danger");
        return;
      }

      if (this.newExtraField.options.some((opt) => opt.trim().length === 0)) {
        Utils.showToast("Optionen dürfen nicht leer sein.", "danger");
        return;
      }

      this.newExtraField.defaultValue = this.newExtraField.options[0];
    }

    if (this.newExtraField.id.length === 0) {
      Utils.showToast("Die ID des Zusatzfeldes darf nicht leer sein.", "danger");
      return;
    }

    this.extraFields.push({ ...this.newExtraField });
    this.newExtraField = {
      id: '',
      name: '',
      type: FieldType.TEXT,
      defaultValue: '',
      options: [],
    };
    modal.dismiss();
  }

  async removeExtraField(index: number) {
    const alert = await this.alertController.create({
      header: 'Zusatzfeld löschen?',
      message: `Möchtest du das Zusatzfeld '${this.extraFields[index].name}' wirklich löschen? Dies kann nicht rückgängig gemacht werden!`,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Löschen",
        handler: () => {
          this.extraFields.splice(index, 1);
        }
      }]
    });

    await alert.present();
  }

  getFieldTypeName(type: FieldType): string {
    switch (type) {
      case FieldType.TEXT:
        return "Text";
      case FieldType.TEXTAREA:
        return "Textbereich";
      case FieldType.NUMBER:
        return "Zahl";
      case FieldType.SELECT:
        return "Auswahl";
      case FieldType.DATE:
        return "Datum";
      case FieldType.BOOLEAN:
        return "Ja/Nein";
      default:
        return "Unbekannt";
    }
  }

  setDefaultValue() {
    this.newExtraField.defaultValue = Utils.getFieldTypeDefaultValue(this.newExtraField.type, this.newExtraField.defaultValue, this.newExtraField.options, this.db.churches());
  }

  onExtraOptionChanged(event: any, index: number) {
    this.newExtraField.options[index] = event.detail.value;
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

    if (this.newCriticalRule.period_days <= 0) {
      Utils.showToast('Der Zeitraum muss größer als 0 sein.', 'danger');
      return;
    }

    this.newCriticalRule.id = crypto.randomUUID();
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

    if (rule.threshold_type === CriticalRuleThresholdType.COUNT) {
      return `${rule.threshold_value}x ${statusNames} in ${rule.period_days} Tagen (${typeNames})`;
    } else {
      return `${rule.threshold_value}% ${statusNames} in ${rule.period_days} Tagen (${typeNames})`;
    }
  }
}
