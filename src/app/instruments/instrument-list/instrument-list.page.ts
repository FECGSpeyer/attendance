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
  public groupedInstruments: { id: number | string, name: string, instruments: Group[], sortOrder?: number }[] = [];
  public isAdmin: boolean = false;
  public isChoir: boolean = false;
  public isGeneral: boolean = false;
  public categories: GroupCategory[];
  public isReordering: boolean = false;
  public isCategoryReordering: boolean = false;

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

        // Within same category, sort by sort_order if available
        const aSortOrder = a.sort_order;
        const bSortOrder = b.sort_order;

        if (aSortOrder !== undefined && aSortOrder !== null &&
            bSortOrder !== undefined && bSortOrder !== null) {
          return aSortOrder - bSortOrder;
        }

        // If only one has sort_order, prioritize it
        if (aSortOrder !== undefined && aSortOrder !== null) return -1;
        if (bSortOrder !== undefined && bSortOrder !== null) return 1;

        // if same category or no category and no sort_order, sort by name
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

    // Group instruments by category for better reordering
    this.groupInstrumentsByCategory();
  }

  private groupInstrumentsByCategory(): void {
    const grouped = new Map<number | null, Group[]>();

    // Group instruments by category
    for (const instrument of this.instruments) {
      const categoryId = instrument.category ?? null;
      if (!grouped.has(categoryId)) {
        grouped.set(categoryId, []);
      }
      grouped.get(categoryId)!.push(instrument);
    }

    // Convert to array format
    this.groupedInstruments = [];
    for (const [categoryId, instruments] of grouped) {
      const category = categoryId ? this.categories.find(cat => cat.id === categoryId) : null;
      const categoryName = category?.name || "Keine Kategorie";
      const categorySortOrder = category?.sort_order;

      this.groupedInstruments.push({
        id: categoryId ?? 'none',
        name: categoryName,
        instruments,
        sortOrder: categorySortOrder
      });
    }

    // Sort groups by category sort_order, then by name
    this.groupedInstruments.sort((a, b) => {
      const aSortOrder = a.sortOrder;
      const bSortOrder = b.sortOrder;

      // If both have sort_order, sort by it
      if (aSortOrder !== undefined && aSortOrder !== null &&
          bSortOrder !== undefined && bSortOrder !== null) {
        return aSortOrder - bSortOrder;
      }

      // If only one has sort_order, prioritize it
      if (aSortOrder !== undefined && aSortOrder !== null) return -1;
      if (bSortOrder !== undefined && bSortOrder !== null) return 1;

      // Otherwise sort by name
      return a.name.localeCompare(b.name);
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

  toggleCategoryReorderMode = (): void => {
    this.isCategoryReordering = !this.isCategoryReordering;
    if (!this.isCategoryReordering) {
      // Save the order when exiting reorder mode
      this.saveCategoryOrder();
    }
  }

  handleCategoryReorder = (event: any): void => {
    const fromIndex = event.detail.from;
    const toIndex = event.detail.to;

    // Perform the reorder
    const itemToMove = this.categories.splice(fromIndex, 1)[0];
    this.categories.splice(toIndex, 0, itemToMove);

    // Complete the reorder
    event.detail.complete();

    // Update sort_order for all categories
    let sortOrder = 1;
    for (const category of this.categories) {
      category.sort_order = sortOrder++;
    }
  }

  private async saveCategoryOrder(): Promise<void> {
    const loading = await Utils.getLoadingElement(5000, 'Reihenfolge wird gespeichert...');
    await loading.present();

    try {
      // Save all categories with their new sort_order
      for (const category of this.categories) {
        if (category.sort_order !== undefined && category.sort_order !== null) {
          await this.db.updateGroupCategorySortOrder(category.id, category.sort_order);
        }
      }

      await loading.dismiss();
      Utils.showToast('Reihenfolge gespeichert', 'success');

      // Reload groups to reflect new category order
      await this.getGroups();
    } catch (error) {
      await loading.dismiss();
      Utils.showToast('Fehler beim Speichern der Reihenfolge', 'danger');
    }
  }

  toggleReorderMode(): void {
    this.isReordering = !this.isReordering;
    if (!this.isReordering) {
      // Save the order when exiting reorder mode
      this.saveOrder();
    }
  }

  handleReorder(event: any, categoryId: number | string): void {
    // Find the category group
    const categoryGroup = this.groupedInstruments.find(g => g.id === categoryId);
    if (!categoryGroup) {
      event.detail.complete(false);
      return;
    }

    const fromIndex = event.detail.from;
    const toIndex = event.detail.to;

    // Perform the reorder within the category's instruments array
    const itemToMove = categoryGroup.instruments.splice(fromIndex, 1)[0];
    categoryGroup.instruments.splice(toIndex, 0, itemToMove);

    // Complete the reorder
    event.detail.complete();

    // Update the main instruments array to reflect the new order
    this.instruments = this.groupedInstruments.flatMap(group => group.instruments);

    // Update sort_order for all instruments across all categories
    this.updateGlobalSortOrder();
  }

  private updateGlobalSortOrder(): void {
    let sortOrder = 1;
    for (const instrument of this.instruments) {
      instrument.sort_order = sortOrder++;
    }
  }

  private async saveOrder(): Promise<void> {
    const loading = await Utils.getLoadingElement(5000, 'Reihenfolge wird gespeichert...');
    await loading.present();

    try {
      // Save all instruments with their new sort_order
      for (const instrument of this.instruments) {
        if (instrument.sort_order !== undefined && instrument.sort_order !== null) {
          await this.db.updateGroup({
            sort_order: instrument.sort_order
          }, instrument.id);
        }
      }

      await loading.dismiss();
      Utils.showToast('Reihenfolge gespeichert', 'success');
    } catch (error) {
      await loading.dismiss();
      Utils.showToast('Fehler beim Speichern der Reihenfolge', 'danger');
    }
  }
}
