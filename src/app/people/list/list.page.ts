import { Component, OnInit, effect } from '@angular/core';
import { ActionSheetController, AlertController, IonItemSliding, IonRouterOutlet, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Instrument, Person, Player, PlayerHistoryEntry } from 'src/app/utilities/interfaces';
import { PersonPage } from '../person/person.page';
import { AttendanceType, PlayerHistoryType, Role } from 'src/app/utilities/constants';
import { Storage } from '@ionic/storage-angular';
import { Utils } from 'src/app/utilities/Utils';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
})
export class ListPage implements OnInit {
  public players: Player[] = [];
  public conductors: Person[] = [];
  public playersFiltered: Player[] = [];
  public instruments: Instrument[] = [];
  public playerToArchive: Player;
  public searchTerm: string = "";
  public filterOpt: string = "all";
  public sortOpt: string = "instrument";
  public viewOpts: string[] = ["instrument"];
  public isVoS: boolean;
  public showNotes = false;
  public showCritical = false;
  public showLeader = false;
  public showPaused = false;
  public showNew = false;
  public showImg = true;
  public showExaminee = false;
  public showInstruments = false;
  public isArchiveModalOpen: boolean = false;
  public archiveDate: string = dayjs().format("YYYY-MM-DD");
  public archiveNote: string = "";
  public isAdmin: boolean = false;
  public isChoir: boolean = false;
  public sub: RealtimeChannel;

  constructor(
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    private db: DbService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private storage: Storage,
  ) {
    effect(async () => {
      this.db.tenant();
      this.instruments = await this.db.getInstruments();
      await this.getPlayers();
    });
  }

  async ngOnInit() {
    this.viewOpts = JSON.parse(await this.storage.get("viewOpts") || JSON.stringify(['instrument', 'leader', 'notes', 'critical', 'paused']));
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.CONDUCTOR;
    this.isChoir = this.db.tenant().type === AttendanceType.CHOIR;
    this.isVoS = this.db.tenant().shortName === 'VoS';
    this.filterOpt = (await this.storage.get("filterOpt")) || "all";
    this.instruments = await this.db.getInstruments();
    await this.getPlayers();

    this.sub = this.db.getSupabase()
      .channel('player-changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player' },
        (event: any) => {
          if (event.new?.tenantId === this.db.tenant().id || event.old?.id) {
            this.getPlayers();
          }
        })
      .subscribe();

    this.onViewChanged();
  }

  async getPlayers(): Promise<void> {
    this.players = await this.db.getPlayers();
    this.conductors = await this.db.getConductors();
    this.players = Utils.getModifiedPlayers(this.players, this.instruments);
    this.searchTerm = "";
    this.initializeItems();
    this.onFilterChanged();
  }

  async openCreateSheet() {
    const actionSheet = await this.actionSheetController.create({
      buttons: [{
        text: this.isChoir ? 'Sänger hinzufügen' : 'Spieler hinzufügen',
        handler: () => {
          this.openModal(undefined, false);
        }
      }, {
        text: 'Dirigent hinzufügen',
        handler: () => {
          this.openModal(undefined, true);
        }
      }, {
        text: 'Beobachter hinzufügen',
        handler: () => {
          this.openViewerAlert();
        }
      }, {
        text: 'Abbrechen',
        role: 'cancel'
      }]
    });

    await actionSheet.present();
  }

  userById(_: number, person: Person): string {
    return String(person.id);
  }

  async openViewerAlert() {
    const alert = await this.alertController.create({
      header: 'Beobachter hinzufügen',
      inputs: [{
        type: "email",
        name: "email",
        placeholder: "E-Mail-Adresse",
      }, {
        name: "firstName",
        placeholder: "Vorname",
      }, {
        name: "lastName",
        placeholder: "Nachname",
      }],
      buttons: [{
        text: "Abbrechen",
      }, {
        text: "Einladen",
        handler: async (data: { email: string, firstName: string, lastName: string }) => {
          if (Utils.validateEmail(data.email) && data.firstName.length && data.lastName.length) {
            const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
            loading.present();
            try {
              await this.db.createViewer(data);
              Utils.showToast("Der Benutzer wurde erfolgreich angelegt.", "success");
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

  async openModal(player?: Player | Person, isConductor?: boolean): Promise<void> {
    if (!isConductor && this.instruments.length === 0) {
      Utils.showToast("Bitte erstelle zuerst ein Instrument", "danger");
      return;
    }
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        existingPlayer: player ? { ...player } : undefined,
        instruments: this.instruments,
        isConductor,
        readOnly: !this.isAdmin,
      },
      backdropDismiss: false,
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data?.conductor) {
      this.conductors = await this.db.getConductors();
    }
  }

  onSortChanged() {
    if (this.sortOpt === "vorname") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => a.firstName.localeCompare(b.firstName));
      return;
    }

    if (this.sortOpt === "nachname") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => a.lastName.localeCompare(b.lastName));
      return;
    }

    if (this.sortOpt === "birthdayAsc") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => new Date(a.birthday).getTime() - new Date(b.birthday).getTime());
      return;
    }

    if (this.sortOpt === "birthdayDesc") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => new Date(b.birthday).getTime() - new Date(a.birthday).getTime());
      return;
    }

    if (this.sortOpt === "test") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => (a.testResult ? Number(a.testResult.replace("%", "")) : 0) - (b.testResult ? Number(b.testResult.replace("%", "")) : 0)).reverse()
      return;
    }

    if (this.sortOpt === "instrument") {
      this.initializeItems();
      this.onFilterChanged();
    }
  }

  async onFilterChanged() {
    this.searchTerm = '';

    if (this.filterOpt === 'all') {
      this.initializeItems();
      await this.storage.set("filterOpt", this.filterOpt);
      return;
    }

    this.playersFiltered = Utils.getModifiedPlayers(this.players.filter((player: Player) => {
      if (this.filterOpt === 'criticals') {
        return player.isCritical;
      } else if (this.filterOpt === "new") {
        return player.isNew;
      } else if (this.filterOpt === "examinee") {
        return player.examinee;
      } else if (this.filterOpt === "active") {
        return !player.paused;
      } else if (this.filterOpt === "withoutTeacher") {
        return !player.hasTeacher;
      } else if (this.filterOpt === "withoutAccount") {
        return !player.appId;
      } else if (this.filterOpt === "withoutTest") {
        return !player.testResult;
      } else {
        return player.isLeader;
      }
    }), this.instruments);

    await this.storage.set("filterOpt", this.filterOpt);
  }

  onViewChanged() {
    this.players = this.players.map((p: Player) => {
      return {
        ...p,
        text: this.getSubText(p),
      }
    });
    this.playersFiltered = this.playersFiltered.map((p: Player) => {
      return {
        ...p,
        text: this.getSubText(p),
      }
    });
    this.showLeader = this.viewOpts.includes("leader");
    this.showCritical = this.viewOpts.includes("critical");
    this.showNew = this.viewOpts.includes("new");
    this.showExaminee = this.viewOpts.includes("examinee");
    this.showPaused = this.viewOpts.includes("paused");
    this.showNotes = this.viewOpts.includes("notes");
    this.showImg = this.viewOpts.includes("img");
    this.showInstruments = this.viewOpts.includes("instrument");

    this.storage.set("viewOpts", JSON.stringify(this.viewOpts));
  }

  getSubText(player: Player): string {
    const props: string[] = [];
    if (this.viewOpts.includes("instrument")) {
      props.push(player.instrumentName);
    }
    if (this.viewOpts.includes("birthday")) {
      props.push(`${dayjs(player.birthday).format("DD.MM.YYYY")} (${Utils.calculateAge(new Date(player.birthday))} Jahre)`);
    }
    if (this.viewOpts.includes("test")) {
      props.push(player.testResult || "Kein Ergebnis");
    }
    if (this.viewOpts.includes("instruments") && player.instruments) {
      props.push(player.instruments);
    }
    if (this.viewOpts.includes("exercises")) {
      if (player.otherExercise) {
        props.push(player.otherExercise)
      }
    }

    return props.join(" | ");
  }

  search(event: any): void {
    if (this.players) {
      this.searchTerm = '';
      this.initializeItems();

      this.searchTerm = event.srcElement.value;

      if (!this.searchTerm) {
        return;
      }

      this.playersFiltered = this.filter();
      this.playersFiltered = Utils.getModifiedPlayers(this.playersFiltered, this.instruments);
    }
  }

  filter(): Player[] {
    if (this.searchTerm === '') {
      return this.players;
    } else {
      return this.players.filter((player: Player) => {
        if (this.searchTerm) {
          if (player.firstName.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1 ||
            player.lastName.toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1 ||
            player.instrumentName.toString().toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1) {
            return true;
          }
          return false;
        }
      });
    }
  }

  initializeItems(): void {
    this.playersFiltered = this.players;
  }

  async remove(player: Person, slider: IonItemSliding, isConductor: boolean = false): Promise<void> {
    const sheet: HTMLIonActionSheetElement = await this.actionSheetController.create({
      buttons: [{
        text: "Archivieren",
        handler: (): void => {
          this.playerToArchive = player as Player;
          this.isArchiveModalOpen = true;
          slider.close();
        },
      }, {
        text: "Entfernen",
        handler: (): void => {
          if (isConductor) {
            this.removeConductor(player);
          } else {
            this.removePlayer(player);
          }
          slider.close();
        },
      }, {
        role: 'cancel',
        text: "Abbrechen",
        handler: () => {
          slider.close();
        }
      }],
    });

    await sheet.present();
  }

  async archivePlayer(): Promise<void> {
    if (!this.playerToArchive.instrument) {
      await this.db.archiveConductor(this.playerToArchive, dayjs(this.archiveDate).toISOString(), this.archiveNote);
      this.dismissArchiveModal();
      this.conductors == await this.db.getConductors();
    } else {
      await this.db.archivePlayer(this.playerToArchive, dayjs(this.archiveDate).toISOString(), this.archiveNote);
      this.dismissArchiveModal();
    }
  }

  dismissArchiveModal(): void {
    this.archiveNote = "";
    this.playerToArchive = undefined;
    this.isArchiveModalOpen = false;
  }

  async removePlayer(player: Person): Promise<void> {
    await this.db.removePlayer(player);
  }

  async removeConductor(conductor: Person): Promise<void> {
    await this.db.removeConductor(conductor);
    this.conductors = await this.db.getConductors();
  }

  async pauseConductor(con: Person, slider: IonItemSliding) {
    await this.db.updateConductor({ ...con, paused: true }, true);
    slider.close();
    this.getPlayers();
  }

  async unpauseConductor(con: Person, slider: IonItemSliding) {
    await this.db.updateConductor({ ...con, paused: false }, true);
    slider.close();
    this.getPlayers();
  }

  async pausePlayer(player: Player, slider: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Spieler pausieren',
      subHeader: 'Gib einen Grund an.',
      inputs: [{
        type: "textarea",
        name: "reason"
      }],
      buttons: [{
        text: "Abbrechen",
        handler: () => {
          slider.close();
        }
      }, {
        text: "Pausieren",
        handler: async (evt: { reason: string }) => {
          if (!evt.reason) {
            alert.message = "Bitte gib einen Grund an!";
            return false;
          }
          const history: PlayerHistoryEntry[] = player.history;
          history.push({
            date: new Date().toISOString(),
            text: evt.reason,
            type: PlayerHistoryType.PAUSED,
          });
          try {
            await this.db.updatePlayer({
              ...player,
              paused: true,
              history,
            }, true);
          } catch (error) {
            Utils.showToast(error, "danger");
          }
          slider.close();
        }
      }]
    });

    await alert.present();
  }

  async unpausePlayer(player: Player, slider: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Spieler wieder aktivieren?',
      buttons: [{
        text: "Abbrechen",
        handler: () => {
          slider.close();
        }
      }, {
        text: "Aktivieren",
        handler: async () => {
          const history: PlayerHistoryEntry[] = player.history;
          history.push({
            date: new Date().toISOString(),
            text: "Spieler wieder aktiv",
            type: PlayerHistoryType.UNPAUSED,
          });
          try {
            await this.db.updatePlayer({
              ...player,
              paused: false,
              history,
            }, true);
          } catch (error) {
            Utils.showToast(error, "danger");
          }
          slider.close();
        }
      }]
    });

    await alert.present();
  }
}
