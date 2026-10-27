import { Component, Input, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular/lazy';
import { AiService } from 'src/app/services/ai.service';
import { DbService } from 'src/app/services/db.service';
import { DefaultAttendanceType } from 'src/app/utilities/constants';
import { GroupCategory, Group, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { translate } from '@jsverse/transloco';

@Component({
    selector: 'app-instrument',
    templateUrl: './instrument.page.html',
    styleUrls: ['./instrument.page.scss'],
    standalone: false
})
export class InstrumentPage implements OnInit {
  @Input() existingInstrument: Group;
  public instrument: Group;
  public isChoir = false;
  public isGeneral = false;
  public categories: GroupCategory[] = [];

  constructor(
    private db: DbService,
    private ai: AiService,
    private modalController: ModalController,
    private alertController: AlertController
  ) { }

  async ngOnInit() {
    this.categories = await this.db.getGroupCategories();
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.instrument = { ...this.existingInstrument };
  }

  async generateSynonyms() {
    if (!this.instrument.name || this.instrument.name.trim().length === 0) {
      Utils.showToast(translate('instruments.nameFirst'), 'danger');
      return;
    }

    const loading = await Utils.getLoadingElement(10000, translate('instruments.generatingSynonyms'));
    await loading.present();

    try {
      const synonyms = await this.ai.getGroupSynonyms(this.instrument.name);
      this.instrument.synonyms = synonyms;
      await loading.dismiss();
      Utils.showToast(translate('instruments.synonymsGenerated'));
    } catch (error) {
      console.error('Fehler beim Generieren der Synonyme:', error);
      await loading.dismiss();
      Utils.showToast(translate('instruments.synonymsFailed'), 'danger');
    }
  }

  async update() {
    if (!this.instrument.name) {
      Utils.showToast(translate('instruments.nameRequired'), 'danger');
      return;
    }

    await this.db.updateGroup({
      notes: this.instrument.notes,
      range: this.instrument.range,
      tuning: this.instrument.tuning,
      clefs: this.instrument.clefs,
      name: this.instrument.name,
      maingroup: this.instrument.maingroup,
      category: this.instrument.category,
      synonyms: this.instrument.synonyms,
    }, this.instrument.id);

    Utils.showToast(translate('instruments.updated', { name: this.instrument.name }));
    await this.modalController.dismiss({
      updated: true,
    });
  }

  async delete() {
    const allPlayers: Player[] = await this.db.getPlayers(true);
    if (Boolean(allPlayers.find((p: Player) => p.instrument === this.instrument.id))) {
      Utils.showToast(translate('instruments.cannotDelete'), 'danger');
      return;
    }

    const alert = await this.alertController.create({
      header: translate('common.confirm'),
      message: translate('instruments.deleteGroup'),
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'destructive',
        }, {
          text: translate('common.yes'),
          handler: async () => {
            await this.db.removeGroup(this.instrument.id);
            await this.modalController.dismiss({
              updated: true,
            });
          }
        }
      ]
    });

    await alert.present();
  }

  async dismiss(): Promise<void> {
    await this.modalController.dismiss();
  }

}
