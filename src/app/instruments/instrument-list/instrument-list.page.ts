import { Component, OnInit } from '@angular/core';
import { AlertController, IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from 'src/app/services/db.service';
import { DefaultAttendanceType, Role } from 'src/app/utilities/constants';
import { GroupCategory, Group, Player } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { InstrumentPage } from '../instrument/instrument.page';

@Component({
    selector: 'app-instrument-list',
    templateUrl: './instrument-list.page.html',
    styleUrls: ['./instrument-list.page.scss'],
    standalone: false
})
export class InstrumentListPage implements OnInit {
  public instruments: Group[] = [];
  public isAdmin: boolean = false;
  public isChoir: boolean = false;
  public isGeneral: boolean = false;
  public categories: GroupCategory[];

  constructor(
    private modalController: ModalController,
    private db: DbService,
    private routerOutlet: IonRouterOutlet,
    private alertController: AlertController
  ) { }

  trackByCategoryId = (_: number, cat: GroupCategory): number => cat.id;

  async ngOnInit() {
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    await this.getGroups();
  }

  async getGroups(): Promise<void> {
    const categoryMap: { [props: number]: boolean } = {};
    this.categories = await this.db.getGroupCategories();
    const players: Player[] = await this.db.getPlayers();
    const instrumentsRaw: Group[] = this.db.groups();
    this.instruments = instrumentsRaw
      .sort((a: Group, b: Group): number => {
        // sort by category name (find it here: a.categoryData.name)
        if (a.categoryData?.name && b.categoryData?.name) {
          if (a.categoryData.name < b.categoryData.name) {
            return -1;
          }
          if (a.categoryData.name > b.categoryData.name) {
            return 1;
          }
        } else if (a.categoryData?.name && !b.categoryData?.name) {
          return -1;
        } else if (!a.categoryData?.name && b.categoryData?.name) {
          return 1;
        }

        // if same category or no category, sort by name
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      }).map((ins: Group): Group => {
        let firstOfCategory = false;

        if (!categoryMap[ins.category]) {
          categoryMap[ins.category] = true;
          firstOfCategory = true;
        }

        return {
          ...ins,
          count: players.filter((player: Player): boolean => player.instrument === ins.id).length,
          clefText: ins.clefs?.map((key: string) => Utils.getClefText(key)).join(", ") || "",
          firstOfCategory,
          categoryName: this.categories.find(cat => cat.id === ins.category)?.name || "Keine Kategorie",
          categoryLength: instrumentsRaw.filter(instrument => instrument.category === ins.category).length,
        }
      });
  }

  async openModal(instrument: Group): Promise<void> {
    if (!this.isAdmin) {
      return;
    }

    const modal: HTMLIonModalElement = await this.modalController.create({
      component: InstrumentPage,
      componentProps: {
        existingInstrument: instrument
      },
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data?.updated) {
      await this.getGroups();
    }
  }

  async addInstrument(value: string | number, modal: any) {
    if (value) {
      await this.db.addGroup(String(value));
    } else {
      Utils.showToast("Bitte gib einem Namen an", "danger");
      return;
    }

    await this.getGroups();

    modal.dismiss();
  }

  async addCategory() {
    const alert = await this.alertController.create({
      header: 'Neue Kategorie',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Name der Kategorie'
        }
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        }, {
          text: 'Hinzufügen',
          handler: async (data) => {
            if (data.name) {
              await this.db.addGroupCategory(data.name);
              this.categories = await this.db.getGroupCategories();
            } else {
              Utils.showToast("Bitte gib einem Namen an", "danger");
              return false;
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async deleteCategory(id: number) {
    const alert = await this.alertController.create({
      header: 'Bestätigen',
      message: 'Kategorie wirklich löschen? Alle Gruppen in dieser Kategorie verlieren die Kategorisierung.',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        }, {
          text: 'Ja',
          handler: async () => {
            await this.db.deleteGroupCategory(id);
            this.categories = await this.db.getGroupCategories();
          }
        }
      ]
    });

    await alert.present();
  }

  async editCategory(id: number) {
    const category = this.categories.find(cat => cat.id === id);
    if (!category) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Kategorie bearbeiten',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: category.name,
          placeholder: 'Name der Kategorie'
        }
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        }, {
          text: 'Speichern',
          handler: async (data) => {
            if (data.name) {
              await this.db.updateGroupCategory(id, data.name);
              this.categories = await this.db.getGroupCategories();
            } else {
              Utils.showToast("Bitte gib einem Namen an", "danger");
              return false;
            }
          }
        }
      ]
    });

    await alert.present();
  }
}
