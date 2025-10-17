import { Component, OnInit } from '@angular/core';
import { AlertController, IonModal } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Role } from 'src/app/utilities/constants';
import { Organisation } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-general',
  templateUrl: './general.page.html',
  styleUrls: ['./general.page.scss'],
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

  constructor(
    public db: DbService,
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
  }

  async saveGeneralSettings() {
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
      });
      Utils.showToast("Einstellungen gespeichert", "success");

      const alert = await new AlertController().create({
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
      const alert = await new AlertController().create({
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
    const alert = await new AlertController().create({
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

    const alert = await new AlertController().create({
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

}
