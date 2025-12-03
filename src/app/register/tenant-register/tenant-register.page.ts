import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Group, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-tenant-register',
  templateUrl: './tenant-register.page.html',
  styleUrls: ['./tenant-register.page.scss'],
})
export class TenantRegisterPage implements OnInit {
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

  constructor(
    public db: DbService,
    private router: Router,
    private alertController: AlertController,
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
      const tenantUsers = await this.db.getTenantsByUserId();
      const tenant = tenantUsers.find(t => t.tenantId === this.tenantData.id);
      if (tenant) {
        Utils.showToast("Sie sind bereits in dieser Instanz registriert.", 'warning');
        this.router.navigate(['/login']);
        return;
      }
    }

    this.groups = (await this.db.getGroups(this.tenantData.id)).filter(g => !g.maingroup);
    this.selectedGroupId = this.groups.length > 0 ? this.groups[0].id : null;
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
}