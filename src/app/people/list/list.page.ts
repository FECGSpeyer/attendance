import { Component, OnInit, effect } from '@angular/core';
import { ActionSheetController, AlertController, IonItemSliding, IonRouterOutlet, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { Attendance, Group, Person, Player, PlayerHistoryEntry, Teacher, Tenant } from 'src/app/utilities/interfaces';
import { PersonPage } from '../person/person.page';
import { DefaultAttendanceType, PlayerHistoryType, Role } from 'src/app/utilities/constants';
import { Storage } from '@ionic/storage-angular';
import { Utils } from 'src/app/utilities/Utils';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Router } from '@angular/router';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
})
export class ListPage implements OnInit {
  public players: Player[] = [];
  public conductors: Person[] = [];
  public playersFiltered: Player[] = [];
  public instruments: Group[] = [];
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
  public showAttendance = false;
  public showTeachers = false;
  public showInstruments = false;
  public isArchiveModalOpen: boolean = false;
  public archiveDate: string = dayjs().format("YYYY-MM-DD");
  public archiveNote: string = "";
  public isAdmin: boolean = false;
  public isChoir: boolean = false;
  public isGeneral: boolean = false;
  public sub: RealtimeChannel;
  public mainGroup: number | undefined;
  public attendances: Attendance[] = [];
  public teachers: Teacher[] = [];
  public linkedTenants: Tenant[] = [];
  public tenantName: string = "";
  public loaded: boolean = false;
  public prevFilterValue: string = "";

  constructor(
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    public db: DbService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private storage: Storage,
    private router: Router
  ) {
    effect(async () => {
      this.loaded = false;
      this.players = [];
      this.playersFiltered = [];
      this.db.tenant();
      this.mainGroup = this.db.getMainGroup()?.id;
      if (this.db.tenant().maintainTeachers) {
        this.teachers = await this.db.getTeachers();
      }

      this.viewOpts = JSON.parse(await this.storage.get(`viewOpts${this.db.tenant().id}`) || JSON.stringify(['instrument', 'leader', 'attendance', 'critical', 'paused']));
      this.filterOpt = (await this.storage.get(`filterOpt${this.db.tenant().id}`)) || "all";

      await this.getPlayers();

      this.linkedTenants = await this.db.getLinkedTenants();

      this.subscribe();
    });
  }

  async ngOnInit() {
    if (this.db.tenant().maintainTeachers) {
      this.teachers = await this.db.getTeachers();
    }

    this.viewOpts = JSON.parse(await this.storage.get(`viewOpts${this.db.tenant().id}`) || JSON.stringify(['instrument', 'leader', 'attendance', 'critical', 'paused']));
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.isVoS = this.db.tenant().shortName === 'VoS';
    this.filterOpt = (await this.storage.get(`filterOpt${this.db.tenant().id}`)) || "all";
    this.mainGroup = this.db.getMainGroup()?.id;

    if (this.isAdmin) {
      await this.showReleaseNotesAlert();
    }

    await this.getPlayers();

    this.subscribe();
  }

  async showReleaseNotesAlert() {
    const hasSeen = await this.storage.get(`seenReleaseNotes_v3_5_0`);
    if (hasSeen || true) { // TODO: remove "|| true" to enable alert again
      return;
    }

    const alert = await this.alertController.create({
      header: 'Neu in Version 3.5.0',
      message: "Schichtpläne sind da! Automatisiere die Planung und Verwaltung deiner Schichten für mehr Effizienz. Auch neu: Anmeldefristen. Setze Anmeldefristen für Termine fest, um eine bessere Organisation zu gewährleisten.",
      buttons: [{
        text: 'Zu den Schichtplänen',
        handler: () => {
          this.modalController.dismiss();
          this.router.navigate(['/tabs/settings/general/shifts']);
        }
      }, 'OK']
    });

    await alert.present();
    await this.storage.set(`seenReleaseNotes_v3_5_0`, true);
  }

  subscribe() {
    this.sub?.unsubscribe();

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
  }

  async getPlayers(): Promise<void> {
    this.players = await this.db.getPlayers();
    this.attendances = await this.db.getAttendance();
    this.players = Utils.getModifiedPlayersForList(
      this.players,
      this.db.groups(),
      this.attendances,
      this.db.attendanceTypes(),
      this.mainGroup,
      this.db.tenant().additional_fields
    );
    this.searchTerm = "";
    this.onViewChanged();
    this.initializeItems();
    this.onSortChanged();

    this.loaded = true;
  }

  userById(_: number, person: Person): string {
    return String(person.id);
  }

  async openModal(player?: Player | Person): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        existingPlayer: player ? { ...player } : undefined,
        readOnly: !this.isAdmin,
      },
      backdropDismiss: false,
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();
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

    if (this.sortOpt === "joinedAsc") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => new Date(a.joined).getTime() - new Date(b.joined).getTime());
      return;
    }

    if (this.sortOpt === "joinedDesc") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => new Date(b.joined).getTime() - new Date(a.joined).getTime());
      return;
    }

    if (this.sortOpt === "attAsc") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => ((a.percentage || 0) - (b.percentage || 0)));
      return;
    }

    if (this.sortOpt === "attDesc") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => ((b.percentage || 0) - (a.percentage || 0)));
      return;
    }

    if (this.sortOpt === "nextBirthday") {
      // Sort by next birthday but ignore the year
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => {
        const aBirthday = new Date(a.birthday);
        const bBirthday = new Date(b.birthday);
        const aNextBirthday = new Date(new Date().getFullYear(), aBirthday.getMonth(), aBirthday.getDate());
        const bNextBirthday = new Date(new Date().getFullYear(), bBirthday.getMonth(), bBirthday.getDate());
        if (aNextBirthday < new Date()) {
          aNextBirthday.setFullYear(aNextBirthday.getFullYear() + 1);
        }
        if (bNextBirthday < new Date()) {
          bNextBirthday.setFullYear(bNextBirthday.getFullYear() + 1);
        }
        return aNextBirthday.getTime() - bNextBirthday.getTime();
      });
      return;
    }

    if (this.sortOpt === "test") {
      this.playersFiltered = this.playersFiltered.sort((a: Player, b: Player) => (a.testResult ? Number(a.testResult.replace("%", "")) : 0) - (b.testResult ? Number(b.testResult.replace("%", "")) : 0)).reverse()
      return;
    }

    if (this.sortOpt === "instrument") {
      this.initializeItems();
      this.onFilterChanged(true);
    }
  }

  onFilterFocused() {
    this.prevFilterValue = this.filterOpt;
  }

  onFilterDismissed() {
    if (
      this.prevFilterValue === this.filterOpt &&
      (this.filterOpt === 'otherInstance' || (this.db.tenant().additional_fields?.find(field => field.type === "select" && this.filterOpt === field.id)))) {
      this.onFilterChanged();
    }
  }

  async onFilterChanged(implicit = false) {
    this.searchTerm = '';

    if (this.filterOpt === 'all') {
      this.initializeItems();
      await this.storage.set(`filterOpt${this.db.tenant().id}`, this.filterOpt);
      await this.storage.set(`filterOptAdd${this.db.tenant().id}`, "");
      return;
    }

    if (this.filterOpt === 'otherInstance') {
      const option = await this.storage.get(`filterOptAdd${this.db.tenant().id}`);

      if (!this.linkedTenants.length) {
        this.filterOpt = 'all';
        this.onFilterChanged();
        return;
      }

      if (implicit) {
        if (option) {
          const usersPerTenant = await this.db.getUsersFromTenant(this.linkedTenants.find((t) => t.longName === option)?.id || 0);
          this.playersFiltered = Utils.getModifiedPlayersForList(this.players.filter((player: Player) => {
            return usersPerTenant.find((u) => u.userId === player.appId);
          }), this.db.groups(), this.attendances, this.db.attendanceTypes(), this.mainGroup, this.db.tenant().additional_fields);
          this.tenantName = option;
          await this.storage.set(`filterOpt${this.db.tenant().id}`, this.filterOpt);
          await this.storage.set(`filterOptAdd${this.db.tenant().id}`, this.tenantName);
        }
        return;
      }

      const alert = await this.alertController.create({
        header: 'Instanz wählen',
        inputs: this.linkedTenants.map((t) => ({
          type: 'radio',
          label: t.longName,
          value: t.id,
          selected: t.longName === option,
        })),
        buttons: [
          {
            text: 'Abbrechen',
            role: 'destructive',
            handler: () => {
              this.filterOpt = 'all';
              this.onFilterChanged();
            }
          },
          {
            text: 'Filtern',
            handler: async (value) => {
              if (!value) {
                this.filterOpt = 'all';
                this.onFilterChanged();
                return;
              }

              const usersPerTenant = await this.db.getUsersFromTenant(value);
              this.playersFiltered = Utils.getModifiedPlayersForList(this.players.filter((player: Player) => {
                return usersPerTenant.find((u) => u.userId === player.appId);
              }), this.db.groups(), this.attendances, this.db.attendanceTypes(), this.mainGroup, this.db.tenant().additional_fields);
              this.tenantName = this.linkedTenants.find((t) => t.id === value)?.longName || "";
              await this.storage.set(`filterOpt${this.db.tenant().id}`, this.filterOpt);
              await this.storage.set(`filterOptAdd${this.db.tenant().id}`, this.tenantName);
            }
          }
        ]
      });
      await alert.present();
      return;
    } else if (this.db.tenant().additional_fields?.find(field => field.type === "select" && this.filterOpt === field.id)) {
      const extraField = this.db.tenant().additional_fields?.find(field => field.type === "select" && this.filterOpt === field.id);
      const option = await this.storage.get(`filterOptAdd${this.db.tenant().id}`);

      if (implicit) {
        if (option) {
          this.playersFiltered = Utils.getModifiedPlayersForList(this.players.filter((player: Player) => {
            return player.additional_fields?.[this.filterOpt] === option;
          }), this.db.groups(), this.attendances, this.db.attendanceTypes(), this.mainGroup, this.db.tenant().additional_fields);
          await this.storage.set(`filterOpt${this.db.tenant().id}`, this.filterOpt);
          await this.storage.set(`filterOptAdd${this.db.tenant().id}`, option);
        }
        return;
      }

      const alert = await this.alertController.create({
        header: extraField.name,
        inputs: extraField.options.map((t, index) => ({
          type: 'radio',
          label: t,
          value: t,
          selected: option ? t === option : index === 0,
        })),
        buttons: [
          {
            text: 'Abbrechen',
            role: 'destructive',
            handler: () => {
              this.filterOpt = 'all';
              this.onFilterChanged();
            }
          },
          {
            text: 'Filtern',
            handler: async (value) => {
              if (!value) {
                this.filterOpt = 'all';
                this.onFilterChanged();
                return;
              }

              this.playersFiltered = Utils.getModifiedPlayersForList(this.players.filter((player: Player) => {
                return player.additional_fields?.[this.filterOpt] === value;
              }), this.db.groups(), this.attendances, this.db.attendanceTypes(), this.mainGroup, this.db.tenant().additional_fields);

              await this.storage.set(`filterOpt${this.db.tenant().id}`, this.filterOpt);
              await this.storage.set(`filterOptAdd${this.db.tenant().id}`, value);
            }
          }
        ]
      });
      await alert.present();
      return;
    }

    this.playersFiltered = Utils.getModifiedPlayersForList(this.players.filter((player: Player) => {
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
      } else if (this.filterOpt === "leaders") {
        return player.isLeader;
      }

      if (this.db.tenant().additional_fields) {
        for (const field of this.db.tenant().additional_fields) {
          if (field.type === "boolean" && this.filterOpt === field.id) {
            if (player.additional_fields?.[field.id] === undefined || player.additional_fields?.[field.id] === null) {
              player.additional_fields[field.id] = Utils.getFieldTypeDefaultValue(field.type, field.defaultValue, field.options);
            }
            return player.additional_fields ? player.additional_fields[field.id] === true : false;
          }
        }
      }

      return true;
    }), this.db.groups(), this.attendances, this.db.attendanceTypes(), this.mainGroup, this.db.tenant().additional_fields);

    await this.storage.set(`filterOpt${this.db.tenant().id}`, this.filterOpt);
    await this.storage.set(`filterOptAdd${this.db.tenant().id}`, "");
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
    this.showAttendance = this.viewOpts.includes("attendance");
    this.showTeachers = this.viewOpts.includes("teachers") && this.db.tenant().maintainTeachers;

    this.storage.set(`viewOpts${this.db.tenant().id}`, JSON.stringify(this.viewOpts));
  }

  getSubText(player: Player): string {
    const props: string[] = [];
    if (this.viewOpts.includes("instrument")) {
      props.push(player.groupName);
    }
    if (this.viewOpts.includes("birthday")) {
      props.push(`${dayjs(player.birthday).format("DD.MM.YYYY")} (${Utils.calculateAge(new Date(player.birthday))} J.)`);
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

  async search(event: any) {
    if (this.players) {
      this.searchTerm = '';
      this.initializeItems();

      this.searchTerm = event.srcElement.value;

      if (!this.searchTerm) {
        return;
      }

      this.playersFiltered = this.filter();
      this.playersFiltered = Utils.getModifiedPlayersForList(
        this.playersFiltered,
        this.db.groups(),
        this.attendances,
        this.db.attendanceTypes(),
        this.mainGroup,
        this.db.tenant().additional_fields
      );
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
            player.groupName.toString().toLowerCase().indexOf(this.searchTerm.toLowerCase()) > -1) {
            return true;
          }
          return false;
        }
      });
    }
  }

  initializeItems(): void {
    this.playersFiltered = [...this.players];
  }

  async remove(player: Person, slider: IonItemSliding): Promise<void> {
    if (player.appId && player.appId === this.db.tenantUser().userId) {
      Utils.showToast("Du kannst dich nicht selbst entfernen!", "danger");
      slider.close();
      return;
    }

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
          this.removePlayer(player);
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
    await this.db.archivePlayer(this.playerToArchive, dayjs(this.archiveDate).toISOString(), this.archiveNote);
    this.dismissArchiveModal();
  }

  dismissArchiveModal(): void {
    this.archiveNote = "";
    this.playerToArchive = undefined;
    this.isArchiveModalOpen = false;
  }

  async removePlayer(player: Person): Promise<void> {
    await this.db.removePlayer(player);
  }

  async pausePlayer(player: Player, slider: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Person pausieren',
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
      header: 'Person wieder aktivieren?',
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
            text: "Person wieder aktiv",
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

  getTeacherName(teacherId?: number): string {
    const teacher = this.teachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : 'Unbekannt';
  }
}
