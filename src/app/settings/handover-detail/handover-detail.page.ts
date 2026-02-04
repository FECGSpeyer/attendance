import { Component, OnInit } from '@angular/core';
import { AlertController, NavController } from '@ionic/angular';
import { DataService } from 'src/app/services/data.service';
import { DbService } from 'src/app/services/db.service';
import { DEFAULT_IMAGE, PlayerHistoryType } from 'src/app/utilities/constants';
import { Group, Player, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

@Component({
  selector: 'app-handover-detail',
  templateUrl: './handover-detail.page.html',
  styleUrls: ['./handover-detail.page.scss'],
})
export class HandoverDetailPage implements OnInit {
  public handoverData: { persons: Player[], stayInInstance: boolean, tenant: Tenant };
  public newTenantGroups: Group[] = [];
  public groupMapping: { [playerId: number]: number } = {};

  constructor(
    private dataService: DataService,
    private navCtrl: NavController,
    private db: DbService,
    private alertController: AlertController,
  ) { }

  async ngOnInit() {
    this.handoverData = this.dataService.getHandoverData();

    if (!this.handoverData) {
      Utils.showToast('Keine Daten für die Personenübergabe vorhanden.', 'danger');
      this.navCtrl.navigateBack('/tabs/settings/handover');
      return;
    }

    this.newTenantGroups = await this.db.getGroups(this.handoverData.tenant.id);

    this.groupMapping = this.handoverData.persons.reduce((acc, player) => {
      acc[player.id] = this.newTenantGroups.find((ins: Group) => {
        if (ins.name === player.groupName) {
          return true;
        }
        // find similar names (e.g. Trompete vs. Bb Trompete)
        if (ins.name.length > 3 && player.groupName.length > 3) {
          return ins.name.includes(player.groupName) || player.groupName.includes(ins.name);
        }
        // find other similar names (e.g. Flöte vs. Querflöte)
        if (ins.name.length > 2 && player.groupName.length > 2) {
          return ins.name.includes(player.groupName) || player.groupName.includes(ins.name);
        }

        return false;
      })?.id ?? this.newTenantGroups[0]?.id;
      return acc;
    }, {} as { [playerId: number]: number });

  }

  async changeGroup(person: Player) {
    const alert = await this.alertController.create({
      header: 'Gruppe auswählen',
      inputs: this.newTenantGroups.map(g => ({
        name: 'group',
        type: 'radio',
        label: g.name,
        value: g.id,
        checked: g.id === this.groupMapping[person.id]
      })),
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        },
        {
          text: 'Ok',
          handler: (data: number) => {
            this.groupMapping[person.id] = data;
          }
        }
      ]
    });
    await alert.present();
  }

  getInsName(insId: number): string {
    return this.newTenantGroups.find(i => i.id === insId)?.name ?? 'Unbekannt';
  }

  async confirmProceed() {
    const alert = await this.alertController.create({
      header: 'Personenübergabe',
      message: `Möchtest du die ${this.handoverData.persons.length} ausgewählten Personen wirklich in die Instanz "${this.handoverData.tenant.longName}" übertragen? ${this.handoverData.stayInInstance ? 'Die Personen bleiben in dieser Instanz erhalten.' : 'Die Personen werden in dieser Instanz archiviert.'}`,
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        },
        {
          text: 'Übertragen',
          handler: () => {
            this.proceed();
          }
        }
      ]
    });

    await alert.present();
  }

  async proceed() {
    const loading = await Utils.getLoadingElement(99999, 'Personen werden übertragen...');
    await loading.present();

    try {
      const result = await this.db.handoverPersons(
        this.handoverData.persons,
        this.handoverData.tenant,
        this.groupMapping,
        this.handoverData.stayInInstance,
        this.newTenantGroups.find(g => g.maingroup)?.id || null
      );

      await loading.dismiss();

      if (result.length) {
        const alert = await this.alertController.create({
          header: 'Fehler bei der Personenübergabe',
          message: `Die folgenden Personen konnten nicht übertragen werden, da sie bereits in der Zielinstanz vorhanden sind:\n${result.map(r => `${r.firstName} ${r.lastName}`).join('\n')}`,
          buttons: ['Ok']
        });
        await alert.present();
      } else {
        Utils.showToast(`${this.handoverData.persons.length} Personen wurden übertragen.`, 'success');
      }
      this.navCtrl.navigateBack('/tabs/settings');
    } catch (error) {
      await loading.dismiss();
      Utils.showToast('Fehler bei der Personenübergabe: ' + error.message, 'danger');
      return;
    }
  }

  trackByPersonId = (_: number, item: Player): number => item.id;
}
