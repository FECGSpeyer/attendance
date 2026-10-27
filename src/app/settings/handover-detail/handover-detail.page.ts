import { Component, OnInit } from '@angular/core';
import { AlertController, NavController } from '@ionic/angular/lazy';
import { DataService } from 'src/app/services/data.service';
import { DbService } from 'src/app/services/db.service';
import { TrackingEvent, TrackingService } from 'src/app/services/tracking/tracking.service';
import { DEFAULT_IMAGE, PlayerHistoryType } from 'src/app/utilities/constants';
import { Group, Player, Tenant } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

@Component({
    selector: 'app-handover-detail',
    templateUrl: './handover-detail.page.html',
    styleUrls: ['./handover-detail.page.scss'],
    standalone: false
})
export class HandoverDetailPage implements OnInit {
  public handoverData: { persons: Player[]; stayInInstance: boolean; tenant: Tenant };
  public newTenantGroups: Group[] = [];
  public groupMapping: { [playerId: number]: number } = {};

  constructor(
    private dataService: DataService,
    private navCtrl: NavController,
    private db: DbService,
    private alertController: AlertController,
    private tracking: TrackingService,
  ) { }

  async ngOnInit() {
    this.handoverData = this.dataService.getHandoverData();

    if (!this.handoverData) {
      Utils.showToast(translate('handover.noData'), 'danger');
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
      header: translate('handover.selectGroup'),
      inputs: this.newTenantGroups.map(g => ({
        name: 'group',
        type: 'radio',
        label: g.name,
        value: g.id,
        checked: g.id === this.groupMapping[person.id]
      })),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'destructive',
        },
        {
          text: translate('common.ok'),
          handler: (data: number) => {
            this.groupMapping[person.id] = data;
          }
        }
      ]
    });
    await alert.present();
  }

  getInsName(insId: number): string {
    return this.newTenantGroups.find(i => i.id === insId)?.name ?? translate('common.unknown');
  }

  async confirmProceed() {
    const alert = await this.alertController.create({
      header: translate('handover.title'),
      message: translate('handover.confirm', { count: this.handoverData.persons.length, tenant: this.handoverData.tenant.longName, note: translate(this.handoverData.stayInInstance ? 'handover.stayNote' : 'handover.archiveNote') }),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'destructive',
        },
        {
          text: translate('handover.transfer'),
          handler: () => {
            this.proceed();
          }
        }
      ]
    });

    await alert.present();
  }

  async proceed() {
    const loading = await Utils.getLoadingElement(99999, translate('handover.transferring'));
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
          header: translate('handover.failed'),
          message: translate('handover.alreadyThere', { names: result.map(r => `${r.firstName} ${r.lastName}`).join('\n') }),
          buttons: [translate('common.ok')]
        });
        await alert.present();
      } else {
        Utils.showToast(translate('handover.transferred', { count: this.handoverData.persons.length }), 'success');
      }
      this.tracking.track(TrackingEvent.HandoverCreated, {
        count: this.handoverData.persons.length,
        stayInInstance: this.handoverData.stayInInstance,
        failed: result.length,
      });
      this.navCtrl.navigateBack('/tabs/settings');
    } catch (error) {
      await loading.dismiss();
      Utils.showToast(translate('handover.failedWith', { error: error.message }), 'danger');
      return;
    }
  }

  trackByPersonId = (_: number, item: Player): number => item.id;

  goBack(): void {
    this.navCtrl.navigateBack('/tabs/settings/handover');
  }
}
