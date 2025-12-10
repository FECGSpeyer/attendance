import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { DEFAULT_IMAGE, FieldType, Role } from 'src/app/utilities/constants';
import { Church, Group, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-tenant-register',
  templateUrl: './tenant-register.page.html',
  styleUrls: ['./tenant-register.page.scss'],
})
export class TenantRegisterPage implements OnInit {
  @ViewChild('chooser') chooser: ElementRef;
  public tenantData: Tenant | null = null;
  public groups: Group[] = [];
  public firstName: string = '';
  public lastName: string = '';
  public birthDate: string = dayjs().subtract(18, 'year').toISOString();
  public email: string = '';
  public password: string = '';
  public phone: string = '';
  public confirmPassword: string = '';
  public selectedGroupId: number | null = null;
  public profilePicture: string = DEFAULT_IMAGE;
  public additionalFields: { id: string, name: string, value: any, type: FieldType, options?: string[] }[] = [];
  private profileImgFile: File | null = null;
  public notes: string = '';
  public churches: Church[] = [];
  public customChurchName: string = '';

  constructor(
    public db: DbService,
    private router: Router,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
  ) { }

  async ngOnInit() {
    const pathParts = window.location.pathname.split('/');
    const registerId = pathParts[pathParts.length - 1];
    this.tenantData = await this.db.getTenantByRegisterId(registerId);
    if (!this.tenantData) {
      Utils.showToast("Ungültiger Freigabe-Link.");
      return;
    }

    if (this.db.user) {
      await this.checkExistent();
    }

    for (const fieldName of this.tenantData.registration_fields || []) {
      const field = this.tenantData.additional_fields.find(f => f.id === fieldName);

      if (field?.id === 'bfecg_church') {
        this.churches = await this.db.getChurches();
      }

      if (field) {
        this.additionalFields.push({
          id: field.id,
          name: field.name,
          value: field?.id === 'bfecg_church' ? "" : field.defaultValue,
          type: field.type,
          options: field.options
        });
      }
    }

    this.groups = (await this.db.getGroups(this.tenantData.id)).filter(g => !g.maingroup);
    this.selectedGroupId = this.groups.length > 0 ? this.groups[0].id : null;
  }

  async checkExistent() {
    const loading = await Utils.getLoadingElement();
    await loading.present();
    const tenantUsers = await this.db.getTenantsByUserId();
    const tenant = tenantUsers.find(t => t.tenantId === this.tenantData.id);
    if (tenant) {
      Utils.showToast("Sie sind bereits in dieser Instanz registriert.", 'warning', 5000);
      this.router.navigate(['/login']);
      await loading.dismiss();
      return;
    }
    await loading.dismiss();
  }

  async login() {
    const alert = await this.alertController.create({
      header: 'Anmelden',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'E-Mail Adresse'
        },
        {
          name: 'password',
          type: 'password',
          placeholder: 'Passwort'
        }
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Anmelden',
          handler: async (data) => {
            try {
              await this.db.login(data.email, data.password, true);
              await this.checkExistent();
              return true;
            } catch (error) {
              return false;
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async register() {
    if (!this.validate()) {
      return;
    }

    const loading = await Utils.getLoadingElement(10000, 'Registrierung läuft...');
    await loading.present();

    const additional_fields: { [key: string]: any } = {};
    for (const field of this.additionalFields) {
      additional_fields[field.id] = field.value;
    }

    try {
      if (additional_fields && additional_fields['bfecg_church'] === '') {
        const churchId = await this.db.createChurch(this.customChurchName);
        additional_fields['bfecg_church'] = churchId;
      }

      const playerId = await this.db.addPlayer({
        firstName: this.firstName,
        lastName: this.lastName,
        email: this.db.user?.email ?? this.email,
        pending: !Boolean(this.tenantData?.auto_approve_registrations),
        birthday: this.birthDate,
        phone: this.phone,
        img: this.profilePicture,
        additional_fields,
        instrument: this.selectedGroupId,
        hasTeacher: false,
        playsSince: new Date().toISOString(),
        isCritical: false,
        isLeader: false,
        correctBirthday: true,
        history: [],
        tenantId: this.tenantData.id,
        joined: new Date().toISOString(),
        notes: this.notes ?? "",
      }, true, Role.APPLICANT, this.tenantData.id, this.password, this.tenantData.longName);

      if (this.tenantData?.registration_fields?.includes('picture')) {
        const url: string = await this.db.updateImage(playerId, this.profileImgFile);
        this.profilePicture = url;
      }
    } catch (error) {
      await loading.dismiss();
      Utils.showToast("Fehler bei der Registrierung, bitte überprüfe deine Eingaben und versuche es erneut.", "danger");
      return;
    }

    void this.db.notifyAboutRegistration(
      `${this.firstName} ${this.lastName}`,
      this.phone,
      this.groups.find(g => g.id === this.selectedGroupId)?.name || '',
      !Boolean(this.tenantData?.auto_approve_registrations),
      this.tenantData.id,
      this.tenantData.longName
    );

    await loading.dismiss();
    this.router.navigate(['/login']);
    const alert = await this.alertController.create({
      header: 'Registrierung erfolgreich',
      message: this.tenantData.auto_approve_registrations ?
        this.db.user ? "Deine Registrierung war erfolgreich! Du bist nun teil der Instanz." : `Dein Konto wurde erstellt. Um dich anmelden zu können, bestätige bitte deine E-Mail. Falls keine E-Mail ankommt, überprüfe bitte deinen Spam-Ordner. Im Anschluss kannst du dich anmelden.` :
        this.db.user ? "Deine Registrierung war erfolgreich! Bitte warte auf die Genehmigung durch einen Administrator." : `Dein Konto wurde erstellt und wartet auf die Genehmigung durch einen Administrator. Bitte bestätige deine E-Mail, um dich anmelden zu können. Falls keine E-Mail ankommt, überprüfe bitte deinen Spam-Ordner.`,
      buttons: [{
        text: 'OK'
      }]
    });

    await alert.present();
  }

  validate(): boolean {
    if (!this.db.user) {
      if (!Utils.validateEmail(this.email)) {
        Utils.showToast("Bitte eine gültige E-Mail Adresse eingeben.", "danger");
        return false;
      } else if (this.password.length < 6) {
        Utils.showToast("Das Passwort muss mindestens 6 Zeichen lang sein.", "danger");
        return false;
      } else if (this.password !== this.confirmPassword) {
        Utils.showToast("Die Passwörter stimmen nicht überein.", "danger");
        return false;
      }
    }

    if (!this.firstName || !this.lastName) {
      Utils.showToast("Bitte geben Sie Ihren Vor- und Nachnamen an.", "danger");
      return false;
    }

    if (this.tenantData?.registration_fields?.includes('picture')) {
      if (this.profilePicture === DEFAULT_IMAGE) {
        Utils.showToast("Bitte wählen Sie ein Passbild aus.", "danger");
        return false;
      }
    }

    if (this.tenantData.registration_fields?.includes('birthDate')) {
      const birthDateObj = dayjs(this.birthDate);
      if (!birthDateObj.isValid()) {
        Utils.showToast("Bitte geben Sie ein gültiges Geburtsdatum an.", "danger");
        return false;
      }
    }

    if (this.tenantData.registration_fields?.includes('phone')) {
      if (!Utils.validatePhoneNumber(this.phone)) {
        Utils.showToast("Bitte geben Sie eine gültige Telefonnummer an.", "danger");
        return false;
      }
    }

    for (const field of this.additionalFields) {
      if (field.type === FieldType.TEXT || field.type === FieldType.TEXTAREA) {
        if (typeof field.value !== 'string' || field.value.trim() === '') {
          Utils.showToast(`Bitte füllen Sie das Feld "${field.name}" aus.`, "danger");
          return false;
        }
      } else if (field.type === FieldType.NUMBER) {
        if (isNaN(Number(field.value))) {
          Utils.showToast(`Bitte geben Sie eine gültige Zahl für das Feld "${field.name}" ein.`, "danger");
          return false;
        }
      } else if (field.type === FieldType.DATE) {
        if (isNaN(Date.parse(field.value))) {
          Utils.showToast(`Bitte geben Sie ein gültiges Datum für das Feld "${field.name}" ein.`, "danger");
          return false;
        }
      } else if (field.type === FieldType.BOOLEAN) {
        if (typeof field.value !== 'boolean') {
          Utils.showToast(`Bitte geben Sie einen gültigen Wert für das Feld "${field.name}" ein.`, "danger");
          return false;
        }
        if (field.value === false && field.name.toLowerCase().includes("einverständnis")) {
          Utils.showToast(`Sie müssen dem Feld "${field.name}" zustimmen, um fortzufahren.`, "danger");
          return false;
        }
      } else if (field.type === FieldType.BFECG_CHURCH) {
        if (typeof field.value !== 'string') {
          Utils.showToast(`Bitte wählen Sie eine Gemeinde aus.`, "danger");
          return false;
        }
        if (field.value === '' && (!this.customChurchName || this.customChurchName.trim().length < 5)) {
          Utils.showToast(`Bitte geben Sie den Namen Ihrer Gemeinde ein.`, "danger");
          return false;
        }
      }
    }

    return true;
  }

  async changeImg() {
    if (this.profilePicture !== DEFAULT_IMAGE) {
      const actionSheet = await this.actionSheetController.create({
        buttons: [{
          text: 'Passbild ersetzen',
          handler: () => {
            this.chooser.nativeElement.click();
          }
        }, {
          text: 'Abbrechen'
        }]
      });
      await actionSheet.present();
      return;
    }

    this.chooser.nativeElement.click();
  }

  async onImageSelect(evt: any) {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const imgFile: File = evt.target.files[0];

    if (imgFile) {
      if (imgFile.size > 2 * 1024 * 1024) {
        loading.dismiss();
        Utils.showToast("Das ausgewählte Bild ist zu groß. Bitte wähle ein Bild unter 2 MB.", "danger");
        return;
      }

      if (imgFile.type.substring(0, 5) === 'image') {
        const reader: FileReader = new FileReader();

        reader.readAsDataURL(imgFile);

        reader.onload = async () => {
          this.profilePicture = String(reader.result);
          this.profileImgFile = imgFile;
          loading.dismiss();
        };
      } else {
        loading.dismiss();
        Utils.showToast("Fehler beim ändern des Passbildes, versuche es später erneut", "danger");
      }
    }
  }
}