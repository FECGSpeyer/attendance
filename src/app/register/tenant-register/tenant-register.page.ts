import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { DEFAULT_IMAGE, FieldType } from 'src/app/utilities/constants';
import { Group, Tenant } from 'src/app/utilities/interfaces';
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
  public additionalFields: { name: string, value: any, type: FieldType, options?: string[] }[] = [];

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
      if (field) {
        this.additionalFields.push({
          name: field.name,
          value: field.defaultValue,
          type: field.type,
          options: field.options
        });
      }
    }

    this.groups = (await this.db.getGroups(this.tenantData.id)).filter(g => !g.maingroup);
    this.selectedGroupId = this.groups.length > 0 ? this.groups[0].id : null;
  }

  async checkExistent() {
    const tenantUsers = await this.db.getTenantsByUserId();
    const tenant = tenantUsers.find(t => t.tenantId === this.tenantData.id);
    if (tenant) {
      Utils.showToast("Sie sind bereits in dieser Instanz registriert.", 'warning', 5000);
      this.router.navigate(['/login']);
      return;
    }
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
    console.log("Registering user...");
    if (!this.firstName || !this.lastName || !this.email || !this.password || !this.confirmPassword) {
      Utils.showToast('Bitte füllen Sie alle Pflichtfelder aus.', 'danger');
      return;
    }
  }

  async changeImg() {
    if (this.profilePicture !== DEFAULT_IMAGE) {
      const actionSheet = await this.actionSheetController.create({
        buttons: [{
          text: 'Profilbild ersetzen',
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
      if (imgFile.type.substring(0, 5) === 'image') {
        const reader: FileReader = new FileReader();

        reader.readAsDataURL(imgFile);

        try {
          // TODO
          const url: string = await this.db.updateImage(0, imgFile, true);
          this.profilePicture = url;
        } catch (error) {
          Utils.showToast(error, "danger");
        }
      } else {
        loading.dismiss();
        Utils.showToast("Fehler beim ändern des Profilbildes, versuche es später erneut", "danger");
      }
    }
  }
}