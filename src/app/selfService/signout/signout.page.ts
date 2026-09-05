/* eslint-disable arrow-body-style */
import { Component, effect, inject, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, AlertController, IonAccordionGroup, IonModal, isPlatform, ModalController } from '@ionic/angular/lazy';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { ActivatedRoute, Router } from '@angular/router';
import dayjs from 'dayjs';
// pdf-lib is lazy-loaded for better initial bundle size
import { DbService } from 'src/app/services/db.service';
import { PushService } from 'src/app/services/push/push.service';
import { AudioPlayerService } from 'src/app/services/audio-player/audio-player.service';
import { TelegramService } from 'src/app/services/telegram/telegram.service';
import { AttendanceStatus, DEFAULT_ABSENCE_REASONS, DEFAULT_LATE_REASONS, DEFAULT_SHOW_ALL_ATTENDANCES_INFO_TEXT, PlayerHistoryType, Role } from 'src/app/utilities/constants';
import { Attendance, PersonAttendance, Player, PlayerAbsence, PlayerHistoryEntry, Song, Tenant, History, SongFile, AttendanceType, Plan } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { PlanViewerComponent } from 'src/app/planning/plan-viewer/plan-viewer.component';
import { ExcuseReasonPickerComponent } from 'src/app/shared/excuse-reason-picker/excuse-reason-picker.component';

@Component({
  selector: 'app-signout',
  templateUrl: './signout.page.html',
  styleUrls: ['./signout.page.scss'],
  standalone: false
})
export class SignoutPage implements OnInit {
  private audioPlayer = inject(AudioPlayerService);
  @ViewChild('signoutAccordionGroup') signoutAccordionGroup: IonAccordionGroup;
  @ViewChild('excusePicker') excusePicker: ExcuseReasonPickerComponent;
  @ViewChild('descriptionModal') descriptionModal: IonModal;
  public selectedDescription: string = '';
  public player: Player;
  public attendances: Attendance[] = [];
  public personAttendances: PersonAttendance[] = [];
  public actualAttendances: PersonAttendance[] = [];
  public currentAttendance: PersonAttendance;
  public selAttIds: string[] = [];
  public perc: number;
  public name: string;
  public signoutTitle: string;
  public lateCount = 0;
  public songs: Song[] = [];
  public tenantId: number;
  public tenants: Tenant[] = [];
  public songsModalOpen = false;
  public upcomingSongs: { date: string; history: History[] }[] = [];
  public isApplicant = false;
  public absenceReasons: string[] = [];
  public lateReasons: string[] = [];
  public canSelfPause = false;
  public isPauseModalOpen = false;
  public pauseReason = '';
  public pauseUntil = '';
  public isAbsenceModalOpen = false;
  public absenceReason = '';
  public absenceFrom = '';
  public absenceUntil = '';
  public canPlannedAbsence = false;
  public playerAbsences: PlayerAbsence[] = [];
  public showAllAttendances = false;
  public showAllAttendancesInfoText = '';

  constructor(
    public db: DbService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private modalController: ModalController,
    private route: ActivatedRoute,
    private router: Router,
    private pushService: PushService,
    private telegramService: TelegramService,
  ) {
    effect(async () => {
      if (this.db.tenant()) {
        this.initialize();
      }
    });

    effect(async () => {
      const id = this.pushService.pendingAttendanceId();
      if (id !== null) {
        this.pushService.consumePendingAttendanceId();
        await this.waitForPersonAttendance(id);
        this.openAttendanceById(id);
      }
    });
  }

  async onTenantChange(tenantId: number): Promise<void> {
    if (this.db.tenant().id === tenantId) { return; }
    const loading = await Utils.getLoadingElement();
    await loading.present();
    await this.db.setTenant(tenantId);
    await this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
    await loading.dismiss();
  }

  async ngOnInit() {
    await this.initialize();
  }

  private waitForPersonAttendance(attendanceId: number): Promise<void> {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        if (this.personAttendances.find(pa => pa.attendance_id === attendanceId) || Date.now() - start > 5000) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  async initialize() {
    this.name = this.db.tenant().longName;
    this.tenants = this.db.tenants();
    this.tenantId = this.db.tenant().id;
    this.showAllAttendances = this.db.tenant().show_all_attendances === true;
    this.showAllAttendancesInfoText = this.db.tenant().show_all_attendances_info_text
      || DEFAULT_SHOW_ALL_ATTENDANCES_INFO_TEXT;

    // Load reasons from tenant config or use defaults
    this.absenceReasons = this.db.tenant().absence_reasons?.length
      ? this.db.tenant().absence_reasons
      : DEFAULT_ABSENCE_REASONS;
    this.lateReasons = this.db.tenant().late_reasons?.length
      ? this.db.tenant().late_reasons
      : DEFAULT_LATE_REASONS;

    if (
      this.db.tenantUser() &&
      (this.db.tenantUser().role === Role.NONE
        || this.db.tenantUser().role === Role.PLAYER
        || this.db.tenantUser().role === Role.HELPER
        || this.db.tenantUser().role === Role.VOICE_LEADER
        || this.db.tenantUser().role === Role.VOICE_LEADER_HELPER
      )
    ) {
      this.player = await this.db.getPlayerByAppId();
      this.songs = await this.db.getSongs();
      await this.getAttendances();

      const perm = this.db.getPermissionForRole(Role.PLAYER);
      this.canSelfPause = !!perm?.player_self_pause;
      if (this.canSelfPause) {
        await this.db.checkAndUnpausePlayers();
        this.player = await this.db.getPlayerByAppId();
      }

      const role = this.db.tenantUser().role;
      const absencePerm = this.db.getPermissionForRole(role);
      this.canPlannedAbsence = !!absencePerm?.player_planned_absence;
      if (this.canPlannedAbsence && this.player) {
        this.playerAbsences = await this.db.getPlayerAbsences(this.player.id);
      }
    } if (this.db.tenantUser()?.role === Role.APPLICANT) {
      this.player = await this.db.getPlayerByAppId();
      this.isApplicant = true;
    }

    const songs = await this.db.getCurrentSongs();
    this.upcomingSongs = [];
    for (const song of songs) {
      const history = song.history.filter((h: History) => this.personAttendances.some((att: PersonAttendance) => att.attendance.id === (h.attendance_id as unknown as Attendance).id));
      if (history.length) {
        this.upcomingSongs.push({
          date: song.date,
          history
        });
      }
    }
  }

  async onExcuseConfirm({ reason, isLate }: { reason: string; isLate: boolean }) {
    const loading = await Utils.getLoadingElement(10000);
    await loading.present();
    try {
      await this.db.signout(this.selAttIds, reason, isLate, false, true);

      Utils.showToast(isLate ? 'Vielen Dank für die Info und Gottes Segen dir!' : 'Vielen Dank für deine rechtzeitige Abmeldung und Gottes Segen dir.', 'success', 4000);

      await this.getAttendances();
    } finally {
      await loading.dismiss();
    }
  }

  async showNoteAlertForSignin(attendance: PersonAttendance) {
    let note = '';
    const alert = await this.alertController.create({
      header: 'Notiz für Anmeldung',
      inputs: [
        {
          name: 'note',
          type: 'textarea',
          placeholder: 'Gib hier deine Notiz ein',
          value: note,
        },
      ],
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel',
        },
        {
          text: 'Anmelden',
          handler: (data) => {
            note = data.note;
            this.signin(attendance, note);
          },
        },
      ],
    });

    await alert.present();
  }

  async signin(attendance: PersonAttendance, notes: string = '') {
    await this.db.signin(
      attendance.id,
      attendance.status === AttendanceStatus.LateExcused ? 'lateSignIn' : attendance.status === AttendanceStatus.Neutral ? 'neutralSignin' : 'signin',
      notes
    );

    Utils.showToast('Schön, dass du dabei bist 🙂', 'success', 4000);

    await this.getAttendances();
  }

  async getAttendances() {
    if (!this.player.paused) {
      this.selAttIds = [];
    }

    if (this.showAllAttendances) {
      // Vergangene: nur eigene Teilnahmen
      const pastPAs = (await this.db.getPersonAttendances(this.player.id, true))
        .filter((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs().startOf('day')))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Zukünftige: alle Termine der Instanz + eigener Status
      const upcomingAll = await this.db.getAllUpcomingAttendancesForSignout(this.player.id);

      this.personAttendances = [...pastPAs, ...[...upcomingAll].reverse()];

      if (pastPAs.length) {
        this.lateCount = pastPAs.filter((a) => a.status === AttendanceStatus.Late).length;
        const vergangeneToCalcPerc = pastPAs.filter((att: PersonAttendance) => {
          const type = this.db.attendanceTypes().find((t) => t.id === att.typeId);
          return type?.include_in_average ?? true;
        });
        pastPAs[0].showDivider = true;
        const attended = vergangeneToCalcPerc.filter((att: PersonAttendance) => att.attended);
        this.perc = vergangeneToCalcPerc.length
          ? Math.round(attended.length / vergangeneToCalcPerc.length * 100)
          : 0;
      } else {
        this.perc = 0;
        this.lateCount = 0;
      }

      this.actualAttendances = [...upcomingAll];
      if (this.actualAttendances.length) {
        this.currentAttendance = this.actualAttendances[0];
        this.actualAttendances.splice(0, 1);
      }
    } else {
      const allPersonAttendances = (await this.db.getPersonAttendances(this.player.id)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      this.personAttendances = allPersonAttendances;

      const vergangene: PersonAttendance[] = this.personAttendances.filter((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs().startOf('day')));
      if (vergangene.length) {
        this.lateCount = vergangene.filter((a) => a.status === AttendanceStatus.Late).length;
        const vergangeneToCalcPerc = vergangene.filter((att: PersonAttendance) => {
          const type = this.db.attendanceTypes().find((t) => t.id === att.typeId);
          return type?.include_in_average ?? true;
        });
        vergangene[0].showDivider = true;
        const attended = vergangeneToCalcPerc.filter((att: PersonAttendance) => att.attended);
        this.perc = vergangeneToCalcPerc.length ? Math.round(
          attended.length / vergangeneToCalcPerc.length * 100) : 0;
      } else {
        this.perc = 0;
      }

      this.actualAttendances = allPersonAttendances.filter((att: PersonAttendance) => dayjs(att.date).isAfter(dayjs().startOf('day'))).reverse();
      if (this.actualAttendances.length) {
        this.currentAttendance = this.actualAttendances[0];
        this.actualAttendances.splice(0, 1);
      }
    }
  }

  private openAttendanceById(attendanceId: number): void {
    const att = this.personAttendances.find(pa => pa.attendance_id === attendanceId);
    if (att) {
      this.presentActionSheetForChoice(att);
    }
  }

  openAttachment(attendance: any) {
    if (attendance?.attachment_url) {
      Browser.open({ url: attendance.attachment_url });
    }
  }

  async openDescription(attendance: PersonAttendance) {
    this.selectedDescription = attendance.attendance?.description || '';
    this.descriptionModal.present();
  }

  async presentActionSheetForChoice(attendance: PersonAttendance) {
    const isExcused = attendance.status === AttendanceStatus.Excused || attendance.status === AttendanceStatus.LateExcused;

    // Read-only for non-participants in show-all mode
    if (this.showAllAttendances && !attendance.id) {
      if (attendance.attendance?.description) {
        await this.openDescription(attendance);
      } else if (attendance.attendance?.share_plan && attendance.attendance?.plan) {
        await this.openPlanViewer(attendance);
      } else if (attendance.attendance?.attachment_url) {
        this.openAttachment(attendance.attendance);
      } else {
        Utils.showToast('Für diesen Termin sind keine weiteren Informationen verfügbar.', 'warning', 3000);
      }
      return;
    }

    let buttons = [
      {
        text: isExcused ? 'Abmeldung zurücknehmen' : 'Anmelden',
        handler: () => this.signin(attendance),
      },
      {
        text: 'Anmelden mit Notiz',
        handler: () => this.showNoteAlertForSignin(attendance),
      },
      {
        text: 'Abmelden',
        handler: () => {
          this.actionSheetController.dismiss();
          this.excusePicker.open(false, this.isAttToday(attendance));
        },
      },
      {
        text: 'Verspätung eintragen',
        handler: () => {
          this.actionSheetController.dismiss();
          this.excusePicker.open(true, this.isAttToday(attendance));
        },
      },
      {
        text: 'Notiz anpassen',
        handler: async () => {
          let note = attendance.notes || '';
          const alert = await this.alertController.create({
            header: 'Notiz anpassen',
            inputs: [
              {
                name: 'note',
                type: 'textarea',
                placeholder: 'Gib hier deine Notiz ein',
                value: note,
              },
            ],
            buttons: [
              {
                text: 'Abbrechen',
                role: 'cancel',
              },
              {
                text: 'Speichern',
                handler: async (data) => {
                  note = data.note;
                  await this.db.updateAttendanceNote(attendance.id, note);
                  Utils.showToast('Notiz erfolgreich aktualisiert.', 'success', 4000);
                  await this.getAttendances();
                },
              },
            ],
          });

          await alert.present();
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Abbrechen',
        handler: () => { },
        role: 'destructive',
        data: {
          action: 'cancel',
        },
      },
    ];

    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === attendance.typeId);

    let canSignin = true;
    if (attendance.attendance.deadline) {
      const deadline = dayjs(attendance.attendance.deadline);
      const localDeadline = deadline.subtract(dayjs().utcOffset(), 'minute');
      const now = dayjs();
      if (now.isAfter(localDeadline)) {
        canSignin = false;
      }
    }

    if (attendance.text === 'X' || !canSignin) {
      buttons = buttons.filter((btn) => btn.text !== 'Anmelden' && btn.text !== 'Abmeldung zurücknehmen' && btn.text !== 'Anmelden mit Notiz');
    } else if (attType && !attType.available_statuses.includes(AttendanceStatus.Excused)) {
      buttons = buttons.filter((btn) => btn.text !== 'Abmelden');
    } else if (attType && !attType.available_statuses.includes(AttendanceStatus.Late)) {
      buttons = buttons.filter((btn) => btn.text !== 'Verspätung eintragen');
    }

    if (attendance.text !== 'X') {
      buttons = buttons.filter((btn) => btn.text !== 'Notiz anpassen');
    }

    if (isExcused) {
      buttons = buttons.filter((btn) => btn.text !== 'Anmelden mit Notiz' && btn.text !== 'Abmelden' && btn.text !== 'Verspätung eintragen');
    } else if (attendance.text === 'A') {
      buttons = buttons.filter((btn) => btn.text !== 'Abmelden' && btn.text !== 'Verspätung eintragen');
    }

    // Add plan viewing option if share_plan is true
    if (attendance.attendance?.share_plan && attendance.attendance?.plan) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: 'Ablaufplan anzeigen',
        handler: () => this.openPlanViewer(attendance),
      });
    }

    if (attendance.attendance?.description) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: 'Beschreibung anzeigen',
        handler: () => this.openDescription(attendance),
      });
    }

    if (attendance.attendance?.attachment_url) {
      const cancelBtn = buttons.find(btn => btn.role === 'destructive');
      const cancelIndex = buttons.indexOf(cancelBtn);
      buttons.splice(cancelIndex, 0, {
        text: 'Anhang öffnen',
        handler: () => this.openAttachment(attendance.attendance),
      });
    }

    if (buttons.length <= 1) {
      Utils.showToast('Für diesen Termin sind keine Aktionen verfügbar.', 'warning', 4000);
      return;
    }

    this.selAttIds = [attendance.id];
    const actionSheet = await this.actionSheetController.create({
      buttons,
    });

    await actionSheet.present();
  }

  hasPastAttendances(attendances: PersonAttendance[]): boolean {
    return attendances.some((att: PersonAttendance) => dayjs(att.date).isBefore(dayjs().startOf('day')));
  }

  attHasPassed(att: PersonAttendance) {
    return dayjs(att.date).isBefore(dayjs(), 'day');
  }

  attIsInFuture(att: PersonAttendance) {
    return dayjs(att.date).isAfter(dayjs(), 'day');
  }

  isExcusedStatus(att: PersonAttendance): boolean {
    return att.status === AttendanceStatus.Excused || att.status === AttendanceStatus.LateExcused;
  }

  isAttToday(att: PersonAttendance) {
    return dayjs(att.date).isSame(dayjs(), 'day');
  }

  getReadableDate(date: string, type_id: string): string {
    return Utils.getReadableDate(date, this.db.attendanceTypes().find(type => type.id === type_id));
  }

  async handleRefresh(event) {
    await this.getAttendances();

    event.target.complete();
  }

  trackByHistoryId = (_: number, item: History): number => item.id;
  trackByAttendanceId = (_: number, item: PersonAttendance): string => item.id;

  async openPlanViewer(attendance: PersonAttendance) {
    const attType = this.db.attendanceTypes().find((type: AttendanceType) => type.id === attendance.typeId);
    const isPractice = attType?.name?.toLowerCase().includes('probe') ||
      attType?.name?.toLowerCase().includes('übung') ||
      attendance.attendance?.type === 'uebung';

    const modal = await this.modalController.create({
      component: PlanViewerComponent,
      componentProps: {
        attendance: attendance.attendance,
        plan: attendance.attendance?.plan as Plan,
        isPractice,
        playerInstrument: this.player?.instrument,
        songs: this.songs
      }
    });

    await modal.present();
  }

  hasPlan(attendance: PersonAttendance): boolean {
    return attendance.attendance?.share_plan && attendance.attendance?.plan?.fields?.length > 0;
  }

  getSongNames(songIds: number[]): string {
    return songIds.map((id: number) => {
      return `${this.songs.find((s: Song) => s.id === id).number} ${this.songs.find((s: Song) => s.id === id).name}`;
    }).join(', ');
  }

  openSongLink(link: string) {
    if (link) {
      Browser.open({ url: link });
    }
  }

  async openSongOptions(song: Song) {
    if (!this.hasSongNotesForPlayer(song)) {
      Utils.showToast('Für dein Instrument sind leider keine Noten verfügbar.', 'danger', 4000);
    }

    const buttons = [];

    if (song.link) {
      buttons.push({
        text: 'Notenlink öffnen',
        handler: () => this.openSongLink(song.link),
      });
    }

    // Get files for player's instrument or Chor notes
    let files = song.files.filter((file: SongFile) => file.instrumentId === this.player.instrument);

    // For choir type, also include files with note="Chor"
    if (this.db.tenant().type === 'choir') {
      const choirFiles = song.files.filter((file: SongFile) =>
        file.note?.toLowerCase() === 'chor'
      );
      files = [...files, ...choirFiles];
      // Remove duplicates if a file is both for the instrument and has "Chor" note
      files = files.filter((file, index, self) =>
        index === self.findIndex(f => f.fileName === file.fileName)
      );
    }

    if (files.length === 1) {
      if (!isPlatform('ios')) {
        buttons.push({
          text: 'Noten downloaden',
          handler: async () => {
            const file = files[0];
            if (file) {
              const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), song.id);
              Utils.downloadFileNative(blob, file.fileName);
            }
          },
        });
      }

      buttons.push({
        text: 'Noten anzeigen',
        handler: () => {
          const file = files[0];
          if (file) {
            Utils.openFileNative(file.url, file.fileName);
          }
        },
      });

      buttons.push({
        text: 'Noten drucken',
        handler: () => {
          const file = files[0];
          if (file) {
            if (Capacitor.isNativePlatform()) {
              Utils.openFileNative(file.url, file.fileName);
            } else {
              const printWindow = window.open(file.url, '_blank');
              if (printWindow) {
                let printed = false;
                printWindow.onload = () => {
                  if (!printed) {
                    printed = true;
                    printWindow.print();
                  }
                };
                setTimeout(() => {
                  if (!printed && printWindow) {
                    printed = true;
                    try {
                      printWindow.print();
                    } catch (e) {
                      console.error('Print failed:', e);
                    }
                  }
                }, 1000);
              } else {
                Utils.showToast('Popup wurde blockiert. Bitte erlaube Popups für diese Seite.', 'warning');
              }
            }
          }
        },
      });
    } else if (files.length > 1) {
      if (!isPlatform('ios')) {
        buttons.push({
          text: 'Noten downloaden',
          handler: async () => {
            const fileOptions = files.map((file: SongFile) => {
              return {
                text: file.fileName,
                role: '',
                handler: async () => {
                  const blob = await this.db.downloadSongFile(file.storageName ?? file.url.split('/').pop(), song.id);
                  Utils.downloadFileNative(blob, file.fileName);
                },
              };
            });

            fileOptions.push({
              text: 'Abbrechen',
              role: 'destructive',
              handler: () => Promise.resolve(),
            });

            const fileActionSheet = await this.actionSheetController.create({
              header: `Noten für ${song.number}. ${song.name} auswählen`,
              buttons: fileOptions,
            });

            await fileActionSheet.present();
          },
        });
      }

      buttons.push({
        text: 'Noten anzeigen',
        handler: async () => {
          const fileOptions = files.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: () => {
                Utils.openFileNative(file.url, file.fileName);
              },
            };
          });

          fileOptions.push({
            text: 'Abbrechen',
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetController.create({
            header: `Noten für ${song.number}. ${song.name} auswählen`,
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });

      buttons.push({
        text: 'Noten drucken',
        handler: async () => {
          const fileOptions = files.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: () => {
                if (Capacitor.isNativePlatform()) {
                  Utils.openFileNative(file.url, file.fileName);
                } else {
                  const printWindow = window.open(file.url, '_blank');
                  if (printWindow) {
                    let printed = false;
                    printWindow.onload = () => {
                      if (!printed) {
                        printed = true;
                        printWindow.print();
                      }
                    };
                    setTimeout(() => {
                      if (!printed && printWindow) {
                        printed = true;
                        try {
                          printWindow.print();
                        } catch (e) {
                          console.error('Print failed:', e);
                        }
                      }
                    }, 1000);
                  } else {
                    Utils.showToast('Popup wurde blockiert. Bitte erlaube Popups für diese Seite.', 'warning');
                  }
                }
              },
            };
          });

          fileOptions.push({
            text: 'Abbrechen',
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetController.create({
            header: `Noten für ${song.number}. ${song.name} drucken`,
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });
    }

    const audioFile = song.files.find(f => f.instrumentId === 1);
    if (audioFile) {
      buttons.push({
        text: 'Aufnahme anhören',
        handler: () => {
          this.audioPlayer.play(audioFile, `${song.number} ${song.name}`);
        },
      });
      buttons.push({
        text: 'Aufnahme herunterladen',
        handler: async () => {
          const blob = await this.db.downloadSongFile(audioFile.storageName ?? audioFile.url.split('/').pop(), song.id);
          Utils.downloadFileNative(blob, audioFile.fileName);
        },
      });
    }

    const liedtextFiles = song.files.filter((file: SongFile) => file.instrumentId === 2);
    if (liedtextFiles.length === 1) {
      buttons.push({
        text: 'Liedtext ansehen',
        handler: () => {
          const file = liedtextFiles[0];
          Utils.openFileNative(file.url, file.fileName);
        },
      });
    } else if (liedtextFiles.length > 1) {
      buttons.push({
        text: 'Liedtext ansehen',
        handler: async () => {
          const fileOptions = liedtextFiles.map((file: SongFile) => {
            return {
              text: file.fileName,
              role: '',
              handler: () => {
                Utils.openFileNative(file.url, file.fileName);
              },
            };
          });

          fileOptions.push({
            text: 'Abbrechen',
            role: 'destructive',
            handler: () => Promise.resolve(),
          });

          const fileActionSheet = await this.actionSheetController.create({
            header: `Liedtext für ${song.number}. ${song.name} auswählen`,
            buttons: fileOptions,
          });

          await fileActionSheet.present();
        },
      });
    }

    buttons.push({
      text: 'Abbrechen',
      handler: () => { },
      role: 'destructive',
      data: {
        action: 'cancel',
      },
    });

    if (buttons.length === 1) {
      Utils.showToast('Für dieses Werk sind keine Aktionen verfügbar.', 'warning', 4000);
      return;
    }

    const actionSheet = await this.actionSheetController.create({
      header: `${song.number}. ${song.name}`,
      buttons,
    });

    await actionSheet.present();
  }

  async printAllCurrentFiles(): Promise<void> {
    const filesToPrint: { song: Song; file: SongFile }[] = [];

    // Collect all files for the player's instrument from upcoming songs
    for (const group of this.upcomingSongs) {
      for (const his of group.history) {
        if (his.song?.files) {
          // Get files for player's instrument
          let file = his.song.files.find(f => f.instrumentId === this.player.instrument);

          // For choir type, also check for files with note="Chor" if no instrument file found
          if (!file && this.db.tenant().type === 'choir') {
            file = his.song.files.find(f => f.note?.toLowerCase() === 'chor');
          }

          if (file) {
            filesToPrint.push({ song: his.song, file });
          }
        }
      }
    }

    if (filesToPrint.length === 0) {
      Utils.showToast('Keine Noten für dein Instrument gefunden.', 'warning');
      return;
    }

    try {
      Utils.showToast('PDFs werden zusammengeführt...', 'primary');

      // Lazy load pdf-lib
      const { PDFDocument } = await import('pdf-lib');

      // Create a new PDF document
      const mergedPdf = await PDFDocument.create();

      // Download and merge each PDF
      for (const entry of filesToPrint) {
        try {
          const pdfBlob = await this.db.downloadSongFile(
            entry.file.storageName ?? entry.file.url.split('/').pop(),
            entry.song.id
          );
          const pdfBytes = await pdfBlob.arrayBuffer();
          const pdf = await PDFDocument.load(pdfBytes);
          const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          pages.forEach(page => mergedPdf.addPage(page));
        } catch (err) {
          console.error(`Fehler beim Laden von ${entry.file.fileName}:`, err);
        }
      }

      // Save and print the merged PDF
      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes as BlobPart], { type: 'application/pdf' });

      if (Capacitor.isNativePlatform()) {
        await Utils.downloadFileNative(blob, 'aktuelle_noten.pdf');
      } else {
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          let printed = false;
          printWindow.onload = () => {
            if (!printed) {
              printed = true;
              printWindow.print();
            }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          };
          setTimeout(() => {
            if (!printed && printWindow) {
              printed = true;
              try {
                printWindow.print();
              } catch (e) {
                console.error('Print failed:', e);
              }
            }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          }, 1500);
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = 'aktuelle_noten.pdf';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          Utils.showToast('PDF heruntergeladen - bitte manuell drucken', 'warning');
        }
      }
    } catch (err) {
      console.error('Fehler beim Zusammenführen der PDFs:', err);
      Utils.showToast('Fehler beim Zusammenführen der PDFs.', 'danger');
    }
  }

  showDeadlineInfo(attendance: PersonAttendance): boolean {
    return Boolean(attendance.attendance.deadline);
  }

  getDeadlineText(attendance: PersonAttendance): string {
    const deadline = dayjs(attendance.attendance.deadline);
    const localDeadline = deadline.subtract(dayjs().utcOffset(), 'minute');
    const now = dayjs();

    if (now.isAfter(localDeadline)) {
      return `Anmeldefrist abgelaufen`;
    } else {
      return `Anmeldefrist: ${localDeadline.format('DD.MM.YYYY HH:mm')} Uhr`;
    }
  }

  /**
   * Check if a song has notes available for the player's instrument.
   * For choir attendance types, also check if there are files with note="Chor".
   */
  hasSongNotesForPlayer(song: Song): boolean {
    if (!song) {return false;}

    // Check if song has the player's instrument in instrument_ids
    const hasInstrumentId = song.instrument_ids?.includes(this.player.instrument);

    // For choir type, also check for files with note="Chor"
    const tenantType = this.db.tenant().type;
    if (tenantType === 'choir') {
      const hasChoirNote = song.files?.some(file =>
        file.note?.toLowerCase() === 'chor'
      );
      return hasInstrumentId || hasChoirNote;
    }

    return hasInstrumentId;
  }

  openPauseModal(): void {
    this.pauseReason = '';
    this.pauseUntil = '';
    this.isPauseModalOpen = true;
  }

  dismissPauseModal(): void {
    this.isPauseModalOpen = false;
    this.pauseReason = '';
    this.pauseUntil = '';
  }

  async confirmPause(): Promise<void> {
    if (!this.pauseReason) {
      Utils.showToast('Bitte gib einen Grund an!', 'warning');
      return;
    }

    const segments: string[] = [];
    if (this.pauseUntil) {
      segments.push(`bis ${dayjs(this.pauseUntil).format('DD.MM.YYYY')}`);
    }
    const pauseText = segments.length
      ? `${this.pauseReason} (${segments.join(' ')})`
      : this.pauseReason;

    const history: PlayerHistoryEntry[] = [...this.player.history];
    history.push({
      date: new Date().toISOString(),
      text: pauseText,
      type: PlayerHistoryType.PAUSED,
    });

    try {
      await this.db.updatePlayer({
        ...this.player,
        paused: true,
        paused_until: this.pauseUntil || null,
        history,
      }, true);
      this.telegramService.notifyPlayerPaused(this.player.id, this.tenantId, this.pauseReason, this.pauseUntil);
      this.player = await this.db.getPlayerByAppId();
      this.dismissPauseModal();
    } catch (error) {
      Utils.showToast(error, 'danger');
    }
  }

  dismissAbsenceModal(): void {
    this.isAbsenceModalOpen = false;
    this.absenceReason = '';
    this.absenceFrom = '';
    this.absenceUntil = '';
  }

  resetAbsenceRange(): void {
    this.absenceFrom = '';
    this.absenceUntil = '';
  }

  onAbsenceDatePick(event: CustomEvent): void {
    const picked: string = event.detail.value;
    if (!picked) return;
    const date = picked.substring(0, 10);
    if (!this.absenceFrom || (this.absenceFrom && this.absenceUntil)) {
      // First tap: set start, clear end
      this.absenceFrom = date;
      this.absenceUntil = '';
    } else {
      // Second tap: set end (swap if before start)
      if (date < this.absenceFrom) {
        this.absenceUntil = this.absenceFrom;
        this.absenceFrom = date;
      } else {
        this.absenceUntil = date;
      }
    }
  }

  get absenceHighlightedDates(): ((dateString: string) => { textColor: string; backgroundColor: string }) | undefined {
    if (!this.absenceFrom || !this.absenceUntil) return undefined;
    const from = this.absenceFrom;
    const until = this.absenceUntil;
    return (dateString: string) => {
      const d = dateString.substring(0, 10);
      if (d === from || d === until) {
        return { textColor: '#ffffff', backgroundColor: 'var(--ion-color-primary)' };
      }
      if (d > from && d < until) {
        return { textColor: 'var(--ion-color-primary)', backgroundColor: 'rgba(var(--ion-color-primary-rgb), 0.15)' };
      }
      return undefined;
    };
  }

  async confirmAbsence(): Promise<void> {
    if (!this.absenceReason || !this.absenceFrom || !this.absenceUntil) {
      Utils.showToast('Bitte fülle alle Pflichtfelder aus', 'danger');
      return;
    }

    const loading = await Utils.getLoadingElement();
    await loading.present();

    try {
      await this.db.addPlayerAbsence({
        tenant_id: this.db.tenant().id,
        person_id: this.player.id,
        from_date: this.absenceFrom,
        until_date: this.absenceUntil,
        reason: this.absenceReason,
      });

      const from = dayjs(this.absenceFrom);
      const until = dayjs(this.absenceUntil);
      const allUpcoming = [
        ...(this.currentAttendance ? [this.currentAttendance] : []),
        ...this.actualAttendances,
      ];
      const toExcuse = allUpcoming.filter(att =>
        !dayjs((att as any).date).isBefore(from, 'day') &&
        !dayjs((att as any).date).isAfter(until, 'day') &&
        att.status !== AttendanceStatus.Excused
      );

      for (const att of toExcuse) {
        await this.db.updatePersonAttendance(att.id, {
          status: AttendanceStatus.Excused,
          notes: this.absenceReason,
        });
      }

      this.dismissAbsenceModal();
      this.playerAbsences = await this.db.getPlayerAbsences(this.player.id);
      await this.getAttendances();
      Utils.showToast(
        toExcuse.length > 0
          ? `Abwesenheit eingetragen (${toExcuse.length} Termin${toExcuse.length > 1 ? 'e' : ''} entschuldigt)`
          : 'Abwesenheit eingetragen',
        'success'
      );
    } finally {
      await loading.dismiss();
    }
  }

  async deleteAbsence(absence: PlayerAbsence): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Abwesenheit löschen',
      message: 'Soll die Abwesenheit gelöscht werden? Bereits entschuldigte Termine in diesem Zeitraum werden auf den Standardstatus des jeweiligen Termintyps zurückgesetzt.',
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Löschen',
          role: 'destructive',
          handler: async () => {
            const loading = await Utils.getLoadingElement();
            await loading.present();
            try {
              await this.db.deletePlayerAbsence(absence.id);

              const from = dayjs(absence.from_date);
              const until = dayjs(absence.until_date);
              const allUpcoming = [
                ...(this.currentAttendance ? [this.currentAttendance] : []),
                ...this.actualAttendances,
              ];
              const toReset = allUpcoming.filter(att =>
                !dayjs((att as any).date).isBefore(from, 'day') &&
                !dayjs((att as any).date).isAfter(until, 'day') &&
                att.status === AttendanceStatus.Excused &&
                att.notes === absence.reason
              );
              for (const att of toReset) {
                const attType = this.db.attendanceTypes().find(t => t.id === att.typeId);
                await this.db.updatePersonAttendance(att.id, {
                  status: attType?.default_status ?? AttendanceStatus.Neutral,
                  notes: '',
                });
              }
              this.playerAbsences = await this.db.getPlayerAbsences(this.player.id);
              await this.getAttendances();
              Utils.showToast('Abwesenheit gelöscht', 'success');
            } finally {
              await loading.dismiss();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmUnpause(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Pausierung beenden',
      message: 'Möchtest du deine Pausierung wirklich beenden und wieder aktiv werden?',
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Reaktivieren',
          handler: async () => {
            const history: PlayerHistoryEntry[] = [...this.player.history];
            history.push({
              date: new Date().toISOString(),
              text: 'Selbst reaktiviert',
              type: PlayerHistoryType.UNPAUSED,
            });

            try {
              await this.db.updatePlayer({
                ...this.player,
                paused: false,
                paused_until: null,
                history,
              }, true);
              this.player = await this.db.getPlayerByAppId();
            } catch (error) {
              Utils.showToast(error, 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }
}
