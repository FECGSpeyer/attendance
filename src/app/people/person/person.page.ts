import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ActionSheetButton, ActionSheetController, AlertController, IonContent, IonItemSliding, IonModal, IonSelect, LoadingController, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import { DbService } from 'src/app/services/db.service';
import { Instrument, Organisation, Parent, Person, PersonAttendance, Player, PlayerHistoryEntry, Teacher, Tenant } from 'src/app/utilities/interfaces';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import { Utils } from 'src/app/utilities/Utils';
import { AttendanceStatus, AttendanceType, DEFAULT_IMAGE, PlayerHistoryType, Role } from 'src/app/utilities/constants';
dayjs.extend(utc);

@Component({
  selector: 'app-person',
  templateUrl: './person.page.html',
  styleUrls: ['./person.page.scss'],
})
export class PersonPage implements OnInit, AfterViewInit {
  @Input() existingPlayer: Player;
  @Input() readOnly: boolean;
  @Input() hasLeft: boolean;
  @ViewChild('select') select: IonSelect;
  @ViewChild('content') content: IonContent;
  @ViewChild('chooser') chooser: ElementRef;

  public newPlayer: Player = {
    firstName: "",
    lastName: "",
    instrument: 1,
    playsSince: new Date().toISOString(),
    joined: new Date().toISOString(),
    birthday: new Date().toISOString(),
    hasTeacher: false,
    isLeader: false,
    notes: "",
    teacher: null,
    isCritical: false,
    correctBirthday: false,
    history: [],
    paused: false,
    tenantId: 999999999,
  };
  public readonly PLAYER: Role = Role.PLAYER;
  public readonly HELPER: Role = Role.HELPER;
  public readonly RESPONSIBLE: Role = Role.RESPONSIBLE;
  public player: Player;
  public birthdayString: string = format(new Date(), 'dd.MM.yyyy');
  public playsSinceString: string = format(new Date(), 'dd.MM.yyyy');
  public joinedString: string = format(new Date(), 'dd.MM.yyyy');
  public max: string = new Date().toISOString();
  public personAttendance: PersonAttendance[] = [];
  public history: any[] = [];
  public teachers: Teacher[] = [];
  public allTeachers: Teacher[] = [];
  public perc: number = 0;
  public maintainTeachers: boolean;
  public isVoS: boolean;
  public solved: boolean = false;
  public hasChanges: boolean = false;
  public notes: string = "";
  public isAdmin: boolean = false;
  public isChoir: boolean = false;
  public isGeneral: boolean = false;
  public lateCount: number = 0;
  public showTeachers: boolean = false;
  public isMainGroup: boolean = false;
  public role: Role = Role.PLAYER;
  public parentsEnabled: boolean = false;
  public parents: Parent[] = [];
  public isParent: boolean = false;
  public instruments: Instrument[] = [];
  public otherTenants: Tenant[] = [];
  public isArchiveModalOpen: boolean = false;
  public archiveDate: string = dayjs().format("YYYY-MM-DD");
  public archiveNote: string = "";
  public isTransferModalOpen = false;
  public copy = false;
  public tenantId: number;
  public tenants: Tenant[] = [];
  public organisation: Organisation | null;
  public tenantGroups: Instrument[] = [];
  public targetGroupId: number;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private actionSheetController: ActionSheetController,
  ) { }

  async ngOnInit() {
    this.instruments = await this.db.getInstruments();
    this.isVoS = this.db.tenant().shortName === 'VoS';
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.isChoir = this.db.tenant().type === AttendanceType.CHOIR;
    this.isGeneral = this.db.tenant().type === AttendanceType.GENERAL;
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isParent = this.db.tenantUser().role === Role.PARENT;
    this.hasChanges = false;
    this.parentsEnabled = this.db.tenant().parents;

    this.showTeachers = this.db.tenant().maintainTeachers;
    if (this.db.tenant().maintainTeachers) {
      this.teachers = await this.db.getTeachers();
      this.allTeachers = this.teachers;
    }

    if (this.parentsEnabled) {
      this.parents = await this.db.getParents();
    }

    if (this.existingPlayer) {
      this.player = { ...this.existingPlayer };
      this.birthdayString = this.formatDate(this.existingPlayer.birthday);
      this.playsSinceString = this.existingPlayer.playsSince ? this.formatDate(this.existingPlayer.playsSince) : "";
      this.joinedString = this.formatDate(this.existingPlayer.joined);
      this.player.teacherName = this.player.teacher ? this.teachers.find((teacher: Teacher) => teacher).name : "";
      this.player.criticalReasonText = this.player.criticalReason ? Utils.getPlayerHistoryTypeText(this.player.criticalReason) : "";

      if (this.player.appId) {
        const role = await this.db.getRoleFromTenantUser(this.player.appId);
        this.role = role === Role.NONE || !role ? Role.PLAYER : role;
      } else {
        this.role = Role.PLAYER;
      }
      await this.getHistoryInfo();
    } else {
      this.player = { ...this.newPlayer };
      this.player.tenantId = this.db.tenant().id;
      this.player.instrument = this.instruments[0].id;
      this.role = Role.PLAYER;
    }

    this.onInstrumentChange(false);

    this.otherTenants = await this.db.getTenantsFromUser(this.player.appId);
    this.organisation = await this.db.getOrganisationFromTenant();
    if (this.organisation) {
      this.tenants = await this.db.getTenantsFromOrganisation();
      if (this.tenants.length) {
        this.tenantId = this.tenants[0].id;
        this.tenantGroups = await this.db.getInstruments(this.tenantId);
      }
    }
  }

  async onTenantChange(): Promise<void> {
    this.tenantGroups = [];
    this.tenantGroups = await this.db.getInstruments(this.tenantId);
  }

  getRoleText(role: Role) {
    return Utils.getRoleText(role);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      const tx = document.getElementsByTagName("textarea");
      for (let i = 0; i < tx.length; i++) {
        tx[i].setAttribute("style", "height:" + (tx[i].scrollHeight) + "px !important;overflow-y:hidden;");
        tx[i].addEventListener("input", OnInput, false);
      }

      function OnInput() {
        this.style.height = 0;
        this.style.height = (this.scrollHeight) + "px";
      }
    }, 500);
  }

  getTypeText(key: number) {
    return Utils.getPlayerHistoryTypeText(key);
  }

  async getHistoryInfo(): Promise<void> {
    // Get all attendances up to today
    const attendances = (await this.db.getPersonAttendances(this.player.id, this.hasLeft))
      .filter((att: PersonAttendance) => dayjs((att as any).date).isBefore(dayjs()));

    // Calculate attendance percentage
    const attendedCount = attendances.filter((att: PersonAttendance) => att.attended).length;
    this.perc = attendances.length ? Math.round(attendedCount / attendances.length * 100) : 0;

    // Count late attendances
    this.lateCount = attendances.filter((a) => a.status === AttendanceStatus.Late).length;

    // Map attendance history
    const attendanceHistory = attendances.map((att: PersonAttendance) => ({
      date: (att as any).date,
      text: (att as any).text,
      type: PlayerHistoryType.ATTENDANCE,
      title: (att as any).title,
      notes: att.notes,
    }));

    // Filter and map player history
    const currentAttDate = await this.db.getCurrentAttDate();
    const playerHistory = this.existingPlayer.history
      .filter((his: PlayerHistoryEntry) =>
        this.isAdmin ||
        [PlayerHistoryType.INSTRUMENT_CHANGE, PlayerHistoryType.PAUSED, PlayerHistoryType.UNPAUSED].includes(his.type)
      )
      .filter((his: PlayerHistoryEntry) => dayjs(currentAttDate).isBefore(dayjs(his.date)))
      .map((his: PlayerHistoryEntry) => ({
        ...his,
        title: "",
        notes: "",
      }));

    // Combine and sort history
    this.history = [...attendanceHistory, ...playerHistory]
      .sort((a: PlayerHistoryEntry, b: PlayerHistoryEntry) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  onInstrumentChange(byUser = true) {
    if (byUser) {
      this.onChange();
    }
    this.teachers = this.allTeachers.filter((t: Teacher) => t.instruments.includes(this.player.instrument));
    if (this.instruments.find((i: Instrument) => i.id === this.player.instrument).maingroup) {
      this.role = Role.RESPONSIBLE;
      this.isMainGroup = true;
    } else {
      if (this.role === Role.RESPONSIBLE && !this.player.appId) {
        this.role = Role.PLAYER;
      }
      this.isMainGroup = false;
    }
  }

  formatDate(value: string) {
    return format(parseISO(value || new Date().toISOString()), 'dd.MM.yyyy');
  }

  async dismiss(): Promise<void> {
    if (this.hasChanges) {
      const alert = await this.alertController.create({
        header: 'Änderungen verwerfen?',
        message: 'Möchtest du die ungespeicherten Änderungen wirklich verwerfen?',
        buttons: [
          {
            text: 'Abbrechen',
            role: 'destructive',
          }, {
            text: 'Ja',
            handler: () => {
              this.modalController.dismiss();
            }
          }
        ]
      });

      await alert.present();
    } else {
      await this.modalController.dismiss();
    }
  }

  async addPerson(): Promise<void> {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
    loading.present();
    if (this.player.firstName && this.player.lastName) {
      await this.db.addPlayer(this.player, Boolean(this.player.email), this.role);
      this.modalController.dismiss();
      Utils.showToast(`Die Person wurde erfolgreich hinzugefügt`, "success");
    } else {
      Utils.showToast("Bitte gib den Vornamen und Nachnamen an.", "danger");
    }
    loading.dismiss();
  }

  async updatePlayer(): Promise<void> {
    if (this.player.email?.length && this.player.email !== this.existingPlayer.email && !Utils.validateEmail(this.player.email)) {
      Utils.showToast("Bitte gib eine valide E-Mail Adresse ein...", "danger");
      return;
    }

    const loading: HTMLIonLoadingElement = await this.loadingController.create();

    if (this.existingPlayer.email !== this.player.email && Utils.validateEmail(this.player.email)) {
      const alert = await this.alertController.create({
        header: 'E-Mail Adresse hinzugefügt',
        message: 'Möchtest du gleich ein Konto für die Person anlegen?',
        buttons: [
          {
            text: 'Abbrechen',
            handler: () => {
              loading.dismiss();
            },
            role: 'destructive',
          },
          {
            text: 'Ja',
            handler: async () => {
              loading.present();
              await this.continueUpdatingPlayer(true, loading);
            },
          },
        ],
      });
      await alert.present();
      return;
    }

    loading.present();
    await this.continueUpdatingPlayer(false, loading);
  }

  async continueUpdatingPlayer(createAccount = false, loading: HTMLIonLoadingElement): Promise<void> {
    const mainGroupId = this.instruments.find((i: Instrument) => i.maingroup)?.id;
    if (this.player.appId && (this.existingPlayer.instrument !== this.player.instrument && this.player.instrument === mainGroupId || this.existingPlayer.instrument === mainGroupId)) {
      await this.db.updateTenantUser({ role: this.player.instrument === mainGroupId ? Role.RESPONSIBLE : Role.PLAYER }, this.player.appId);
    }

    const history = this.player.history;
    if (this.solved) {
      history.push({
        date: new Date().toISOString(),
        text: this.notes,
        type: this.player.criticalReason,
      });
    }

    if (this.existingPlayer.instrument !== this.player.instrument) {
      history.push({
        date: new Date().toISOString(),
        text: `${this.instruments.find((ins: Instrument) => ins.id === this.existingPlayer.instrument).name} -> ${this.instruments.find((ins: Instrument) => ins.id === this.player.instrument).name}`,
        type: PlayerHistoryType.INSTRUMENT_CHANGE,
      });
    }

    if ((this.existingPlayer.notes || "") !== this.player.notes) {
      history.push({
        date: new Date().toISOString(),
        text: this.existingPlayer.notes || "Keine Notiz",
        type: PlayerHistoryType.NOTES,
      });
    }

    try {
      await this.db.updatePlayer({
        ...this.player,
        isCritical: this.solved ? false : this.player.isCritical,
        lastSolve: this.solved ? new Date().toISOString() : this.player.lastSolve,
      }, false, createAccount, this.role);

      loading.dismiss();
      this.hasChanges = false;
      await this.dismiss();

      Utils.showToast("Die Spielerdaten wurden erfolgreich aktualisiert.", "success");
    } catch (error) {
      loading.dismiss();
      Utils.showToast("Fehler beim aktualisieren des Spielers", "danger");
    }
  }

  async onRoleChange() {
    await this.db.updateTenantUser({ role: this.role }, this.player.appId);
    Utils.showToast("Die Rolle wurde erfolgreich aktualisiert.", "success");
  }

  async removeUserFromTenant() {
    const alert = await this.alertController.create({
      header: 'Benutzer entfernen',
      message: 'Möchtest du den Benutzer wirklich aus der Instanz entfernen?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        }, {
          text: 'Ja',
          handler: async () => {
            try {
              await this.db.removeUserFromTenant(this.player.appId);
              await this.db.updatePlayer({
                ...this.player,
                email: null,
                appId: null,
              });
              this.hasChanges = false;
              await this.dismiss();
              Utils.showToast("Der Benutzer wurde erfolgreich entfernt", "success");
            } catch (error) {
              Utils.showToast("Fehler beim Entfernen des Benutzers", "danger");
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async onChangeName() {
    if (this.player.firstName?.length && this.player.lastName?.length) {
      const names = await this.db.getPossiblePersonsByName(this.player.firstName, this.player.lastName, false);

      if (names.length) {
        const alert = await this.alertController.create({
          header: 'Mögliche Übereinstimmung',
          message: 'Es wurden mögliche Übereinstimmungen in anderen Instanzen gefunden. Möchtest du die Daten übernehmen?',
          inputs: names.map((person: Person, index: number) => ({
            type: 'radio',
            checked: index === 0,
            label: `${(person as any).instrument.name} (${(person as any).tenantId.longName})`,
            value: person,
          })),
          buttons: [
            {
              text: 'Abbrechen',
              role: 'destructive',
            }, {
              text: 'Ja',
              handler: async (value: Player) => {
                this.player.email = value.email;
                if (value.correctBirthday) {
                  this.player.birthday = value.birthday;
                  this.birthdayString = this.formatDate(this.player.birthday);
                }
                this.player.img = value.img || DEFAULT_IMAGE;
                this.player.otherExercise = value.otherExercise;
                this.player.range = value.range;

                const instrument = this.instruments.find((i: Instrument) => i.name === (value as any).instrument.name);
                if (instrument) {
                  this.player.instrument = instrument.id;
                }

                Utils.showToast("Die Daten wurden erfolgreich übernommen", "success");
              }
            }
          ]
        });

        await alert.present();
      }
    }
  }

  onChange() {
    if (!this.readOnly && this.existingPlayer) {
      const existingPerson: Player = { ...this.existingPlayer, email: this.player.email === null ? null : this.existingPlayer.email || "", teacherName: this.player.teacherName, notes: this.player.notes === null ? null : this.existingPlayer.notes || "", criticalReasonText: this.player.criticalReasonText };

      this.hasChanges =
        this.solved ||
        JSON.stringify(existingPerson) !== JSON.stringify(this.player);
    }
  }

  onBirthdayChange(value: string | string[], modal: IonModal) {
    this.onChange();
    this.player.correctBirthday = true;

    if (parseInt(this.birthdayString.substring(0, 2), 10) !== dayjs(this.player.birthday).date()) {
      modal.dismiss();
    }

    this.birthdayString = this.formatDate(String(value));
  }

  onPlaysSinceChange(value: string | string[], modal: IonModal) {
    this.onChange();

    if (parseInt(this.playsSinceString.substring(0, 2), 10) !== dayjs(this.player.playsSince).date()) {
      modal.dismiss();
    }

    this.playsSinceString = this.formatDate(String(value));
  }

  onJoinedChange(value: string | string[], modal: IonModal) {
    this.onChange();

    if (parseInt(this.joinedString.substring(0, 2), 10) !== dayjs(this.player.joined).date()) {
      modal.dismiss();
    }

    this.joinedString = this.formatDate(String(value));
  }

  async removeHis(his: PlayerHistoryEntry, slider: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Eintrag unwiderruflich entfernen?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
          handler: () => slider.close()
        }, {
          text: 'Ja',
          handler: async () => {
            const history = this.player.history.filter((h: PlayerHistoryEntry) => h.date !== his.date);

            try {
              const res = await this.db.updatePlayerHistory(
                this.player.id,
                history,
              );
              this.existingPlayer = { ...res } as any;
              this.player.history = res.history as any;
              this.getHistoryInfo();
              Utils.showToast("Eintrag wurde erfolgreich entfernt.", "success");
            } catch {
              Utils.showToast("Fehler beim Löschen des Eintrags.", "danger");
            }

            slider.close();
          }
        }
      ]
    });

    await alert.present();
  }

  async register() {
    const loading: HTMLIonLoadingElement = await this.loadingController.create();
    loading.present();

    try {
      await this.db.createAccount(this.player);
      await this.modalController.dismiss();
      Utils.showToast("Account wurde erfolgreich angelegt", "success");
      await loading.dismiss();
    } catch (error) {
      Utils.showToast(error.message, "danger");
      await loading.dismiss();
    }
  }

  async changeImg() {
    const additionalButtons: {}[] = [];

    if (this.player.img !== DEFAULT_IMAGE) {
      additionalButtons.push({
        text: 'Profilbild entfernen',
        handler: () => {
          this.db.removeImage(this.player.id, this.player.img.split("/")[this.player.img.split("/").length - 1]);
          this.player.img = DEFAULT_IMAGE;
          Utils.showToast("Das Profilbild wurde erfolgreich entfernt", "success");
        }
      });
    }

    const actionSheet = await this.actionSheetController.create({
      buttons: [{
        text: 'Profilbild ersetzen',
        handler: () => {
          this.chooser.nativeElement.click();
        }
      }, ...additionalButtons, {
        text: 'Abbrechen'
      }]
    });

    await actionSheet.present();
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
          const url: string = await this.db.updateImage(this.player.id, imgFile);
          this.player.img = url;
        } catch (error) {
          Utils.showToast(error, "danger");
        }
      } else {
        loading.dismiss();
        Utils.showToast("Fehler beim ändern des Profilbildes, versuche es später erneut", "danger");
      }
    }
  }

  getAttText(text: string) {
    return text === 'X' ? '✓' :
      text === 'L' ? 'L' :
        text === 'E' ? 'E' : text === 'N' ? 'N' : 'A';
  }

  async onHisItemClicked(his: PlayerHistoryEntry) {
    if (his.type === PlayerHistoryType.NOTES) {
      const alert = await this.alertController.create({
        header: 'Notiz geändert',
        subHeader: dayjs(his.date).format("DD.MM.YYYY"),
        message: `Alte Notiz: ${his.text}`,
        buttons: ['Ok']
      });

      await alert.present();
    }
  }

  async searchPerson() {
    const names = await this.db.getPossiblePersonsByName(this.player.firstName, this.player.lastName);

    if (names.length === 0) {
      Utils.showToast("Es wurde keine passende Person in einer anderen Instanz gefunden", "danger");
      return;
    }

    const actionSheet = await this.actionSheetController.create({
      header: "Eintrag auswählen",
      buttons: names.map((name) => {
        return {
          text: `${(name as any).instrument.name} (${(name as any).tenantId.longName})`,
          handler: async () => {
            this.player.email = name.email;
            await this.db.updatePlayer({
              ...this.player,
              email: name.email,
            });
            Utils.showToast("Die E-Mail Adresse wurde erfolgreich aktualisiert", "success");
          }
        };
      })
    });

    await actionSheet.present();
  }

  async openMoreMenu() {
    const buttons: ActionSheetButton[] = [];

    if (this.player.paused) {
      buttons.push({
        text: 'Wieder aktivieren',
        handler: async () => {
          const history: PlayerHistoryEntry[] = this.player.history;
          history.push({
            date: new Date().toISOString(),
            text: "Person wieder aktiv",
            type: PlayerHistoryType.UNPAUSED,
          });
          try {
            await this.db.updatePlayer({
              ...this.player,
              paused: false,
              history,
            }, true);
            this.hasChanges = false;
            await this.dismiss();
          } catch (error) {
            Utils.showToast(error, "danger");
          }
        }
      });
    } else {
      buttons.push({
        text: 'Pausieren',
        handler: async () => {
          const alert = await this.alertController.create({
            header: 'Person pausieren',
            subHeader: 'Gib einen Grund an.',
            inputs: [{
              type: "textarea",
              name: "reason"
            }],
            buttons: [{
              text: "Abbrechen",
            }, {
              text: "Pausieren",
              handler: async (evt: { reason: string }) => {
                if (!evt.reason) {
                  alert.message = "Bitte gib einen Grund an!";
                  return false;
                }
                const history: PlayerHistoryEntry[] = this.player.history;
                history.push({
                  date: new Date().toISOString(),
                  text: evt.reason,
                  type: PlayerHistoryType.PAUSED,
                });
                try {
                  await this.db.updatePlayer({
                    ...this.player,
                    paused: true,
                    history,
                  }, true);
                  this.hasChanges = false;
                  await this.dismiss();
                } catch (error) {
                  Utils.showToast(error, "danger");
                }
              }
            }]
          });

          await alert.present();
        }
      });
    }

    if (this.organisation && this.tenants.length) {
      buttons.push({
        text: "In andere Instanz übertragen",
        handler: async (): Promise<void> => {
          this.copy = false;
          this.isTransferModalOpen = true;
        }
      });

      buttons.push({
        text: "In andere Instanz kopieren",
        handler: async (): Promise<void> => {
          this.copy = true;
          this.isTransferModalOpen = true;
        }
      });
    }

    buttons.push({
      text: "Archivieren",
      handler: (): void => {
        this.isArchiveModalOpen = true;
      },
      role: 'destructive',
    });

    if (this.player.appId !== this.db.tenantUser().userId) {
      buttons.push({
        text: "Entfernen",
        handler: async (): Promise<void> => {
          const alert = await this.alertController.create({
            header: 'Person entfernen',
            message: 'Möchtest du die Person wirklich entfernen? Alle zugehörigen Daten (Abwesenheiten, Notizen, etc.) gehen dabei verloren!',
            buttons: [
              {
                text: 'Abbrechen',
                role: 'destructive',
              }, {
                text: 'Ja',
                handler: async () => {
                  this.modalController.dismiss();
                  try {
                    await this.db.removePlayer(this.player);
                    Utils.showToast("Die Person wurde erfolgreich entfernt", "success");
                  } catch (error) {
                    Utils.showToast(error, "danger");
                  }
                },
              }
            ]
          });
          await alert.present();
        },
        role: 'destructive',
      });
    }

    buttons.push({
      text: 'Abbrechen',
      role: 'destructive',
    });

    const actionSheet = await this.actionSheetController.create({
      header: 'Aktionen',
      buttons
    });
    await actionSheet.present();
  }

  async transferPerson() {
    const alert = await this.alertController.create({
      header: this.copy ? 'Person kopieren' : 'Person übertragen',
      message: this.copy ? 'Möchtest du die Person wirklich in die andere Instanz kopieren?' : 'Möchtest du die Person wirklich in die andere Instanz übertragen? Alle zugehörigen Daten (Abwesenheiten, Notizen, etc.) gehen dabei verloren!',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        }, {
          text: 'Ja',
          handler: async () => {
            try {
              await this.db.handoverPerson(this.player, this.tenants.find(t => t.id === this.tenantId), this.targetGroupId, this.copy, this.isMainGroup ? this.player.instrument : null);
              if (!this.copy) {
                this.hasChanges = false;
                await this.dismiss();
              }
              Utils.showToast(this.copy ? "Die Person wurde erfolgreich kopiert" : "Die Person wurde erfolgreich übertragen", "success");
              this.isTransferModalOpen = false;
            } catch (error) {
              Utils.showToast(error, "danger");
              return;
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async archivePlayer(): Promise<void> {
    await this.db.archivePlayer(this.player, dayjs(this.archiveDate).toISOString(), this.archiveNote);
    await this.dismissArchiveModal();
    this.hasChanges = false;
    setTimeout(async () => {
      await this.dismiss();
    }, 500);
    Utils.showToast("Die Person wurde erfolgreich archiviert", "success");
  }

  async dismissArchiveModal(): Promise<void> {
    this.archiveNote = "";
    this.isArchiveModalOpen = false;
  }

  async activate(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Person reaktivieren',
      message: 'Möchtest du die Person wirklich reaktivieren?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'destructive',
        }, {
          text: 'Ja',
          handler: () => this.activateConfirmed()
        }
      ]
    });

    await alert.present();
  }

  async activateConfirmed(): Promise<void> {
    await this.db.activatePlayer(this.player);
    this.hasChanges = false;
    this.modalController.dismiss({ activated: true });
    Utils.showToast("Die Person wurde erfolgreich wieder aktiviert", "success");
  }

}
