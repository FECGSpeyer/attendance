import { Component, OnInit, effect } from '@angular/core';
import { AlertController, IonModal, IonRouterOutlet, ModalController } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import * as dayjs from 'dayjs';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import { autoTable as AutoTable } from 'jspdf-autotable';
import { ExportPage } from 'src/app/export/export.page';
import { HistoryPage } from 'src/app/history/history.page';
import { PersonPage } from 'src/app/people/person/person.page';
import { PlanningPage } from 'src/app/planning/planning.page';
import { DbService } from 'src/app/services/db.service';
import { StatsPage } from 'src/app/stats/stats.page';
import { AttendanceStatus, AttendanceType, Role } from 'src/app/utilities/constants';
import { Instrument, Person, PersonAttendance, Player, Song, Tenant, TenantUser, History, Attendance } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { Viewer } from '../../utilities/interfaces';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { RegisterPage } from 'src/app/register/register.page';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit {
  public conductors: Person[] = [];
  public selConductors: number[] = [];
  public leftPlayers: Player[] = [];
  public leftConductors: Person[] = [];
  public playersWithoutAccount: Player[] = [];
  public version: string = require('../../../../package.json').version;
  public maintainTeachers: boolean = false;
  public instruments: Instrument[] = [];
  public viewers: Viewer[] = [];
  public isAdmin: boolean = false;
  public isSuperAdmin: boolean = false;
  public attDateString: string = format(new Date(), 'dd.MM.yyyy');
  public attDate: string = new Date().toISOString();
  public practiceStart: string;
  public practiceEnd: string;
  public tenantId: number;

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet,
    private router: Router,
    private storage: Storage,
  ) {
    effect(async () => {
      this.db.tenant();
      await this.initialize();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isSuperAdmin = this.db.tenantUser().role === Role.ADMIN;
    this.attDate = await this.db.getCurrentAttDate();
    this.tenantId = this.db.tenant().id;
    this.maintainTeachers = this.db.tenant().maintainTeachers;
    this.practiceStart = this.db.tenant().practiceStart || '18:00';
    this.practiceEnd = this.db.tenant().practiceEnd || '20:00';
    this.attDateString = format(new Date(this.attDate), 'dd.MM.yyyy');
    const allConductors: Person[] = await this.db.getConductors(true);
    this.conductors = allConductors.filter((con: Person) => !con.left);
    this.selConductors = this.conductors.filter((con: Person) => Boolean(!con.left)).map((c: Person): number => c.id);
    this.instruments = await this.db.getInstruments();
    this.leftPlayers = Utils.getModifiedPlayersForList(await this.db.getLeftPlayers(), this.instruments, [], this.instruments.find(ins => ins.maingroup)?.id);
    this.leftConductors = allConductors.filter((con: Person) => Boolean(con.left));
    this.viewers = await this.db.getViewers();
    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
  }

  async ionViewWillEnter() {
    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();
    this.viewers = await this.db.getViewers();
  }

  async logout() {
    await this.db.logout();
  }

  async saveGeneralSettings(generalModal: IonModal) {

  }

  onAttDateChange(value: string, dateModal: IonModal) {
    if (parseInt(this.attDateString.substring(0, 2), 10) !== dayjs(this.attDate).date()) {
      dateModal.dismiss();
    }

    this.attDateString = this.formatDate(value);
  }

  formatDate(value: string): string {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  createPlan(conductors: number[], timeString: string | number, modal: IonModal, perTelegram?: boolean): void {
    const shuffledConductors: string[] = this.shuffle(conductors.map((id: number): string => {
      const con: Person = this.conductors.find((c: Person): boolean => id === c.id);
      return `${con.firstName} ${con.lastName.substr(0, 1)}.`;
    }));
    const date: string = dayjs().format('DD.MM.YYYY');
    const data = [];
    const timePerUnit: number = Number(timeString) / shuffledConductors.length;

    for (let index = 0; index < conductors.length; index++) {
      const slotTime = Math.round(timePerUnit * index);
      data.push([
        String(slotTime),
        shuffledConductors[(index) % (shuffledConductors.length)],
        shuffledConductors[(index + 1) % (shuffledConductors.length)],
        shuffledConductors[(index + 2) % (shuffledConductors.length)]
      ]); // TODO attendance type
    }

    const doc = new jsPDF();
    doc.text(`${this.db.tenant().shortName} Registerprobenplan: ${date}`, 14, 25);
    ((doc as any).autoTable as AutoTable)({
      head: this.db.tenant().type === AttendanceType.CHOIR ? [["Minuten", "Sopran", "Alt", "Tenor", "Bass"]] : this.db.tenant().shortName === "BoS" ? [['Minuten', 'Blechbläser', 'Holzbläser']] : [['Minuten', 'Streicher', 'Holzbläser', 'Sonstige']], // TODO attendance type
      body: data,
      margin: { top: 40 },
      theme: 'grid',
      headStyles: {
        halign: 'center',
        fillColor: [0, 82, 56]
      }
    });

    if (perTelegram) {
      this.db.sendPlanPerTelegram(doc.output('blob'), `Registerprobenplan_${dayjs().format('DD_MM_YYYY')}`);
    } else {
      doc.save(`${this.db.tenant().shortName} Registerprobenplan: ${date}.pdf`);
    }

    modal.dismiss();
  }

  shuffle(a: string[]) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async openHistoryModal(): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: HistoryPage,
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
  }

  async openStats(): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: StatsPage,
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
  }

  async openExport(): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: ExportPage,
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
  }

  async openPlanning(): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PlanningPage,
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
  }

  async openPlayerModal(p: Player | Person) {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: PersonPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        existingPlayer: { ...p },
        instruments: this.instruments,
        readOnly: true,
        hasLeft: true,
      }
    });

    await modal.present();
  }

  async createAccounts() {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(99999999);

    loading.present();

    for (let player of this.playersWithoutAccount) {
      await this.db.createAccount(player);
    }

    Utils.showToast("Die Accounts wurden erfolgreich angelegt", "success");

    this.playersWithoutAccount = await this.db.getPlayersWithoutAccount();

    loading.dismiss();
  }

  async removeViewer(viewer: Viewer): Promise<void> {
    const alert = await new AlertController().create({
      header: 'Beobachter entfernen?',
      message: `Möchtest du ${viewer.firstName} wirklich entfernen?`,
      buttons: [{
        text: "Abbrechen"
      }, {
        text: "Ja",
        handler: async () => {
          await this.db.removeEmailFromAuth(viewer.appId, viewer.email);
          this.viewers = await this.db.getViewers();
        }
      }]
    });

    await alert.present();
  }

  getAttendanceTypePersonaText(): string {
    if (this.db.tenant().type === AttendanceType.CHOIR) {
      return "Sänger";
    } else if (this.db.tenant().type === AttendanceType.ORCHESTRA) {
      return "Spieler";
    } else {
      return "Personen";
    }
  }

  async onTenantChange(): Promise<void> {
    this.db.setTenant(this.tenantId);
    this.router.navigateByUrl(Utils.getUrl(this.db.tenantUser().role));
  }

  async openCreateInstanceModal() {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: RegisterPage,
      presentingElement: this.routerOutlet.nativeEl,
    });

    await modal.present();
  }

  // migrate viewers
  async migrate() {
    // await this.addInstruments();
    // const allInstruments: Instrument[] = await this.db.getInstruments();
    // await this.addPlayers(allInstruments);
    // const allPlayers: Player[] = await this.db.getPlayers();
    // await this.syncTenantUsers(allPlayers);
    // await this.addConductors(allInstruments);
    // const allConductors: Person[] = await this.db.getConductors(true);
    // await this.syncConductorTenantUsers(allConductors as any);
    // await this.addSongsAndHistory(allConductors);
    // const allSongs = await this.db.getSongs();
    // await this.addAttendances(allSongs);
    // this.addMeetings();

    Utils.showToast("Migration erfolgreich durchgeführt", "success");
  }

  async addMeetings() {
    const allConductors: Player[] = await this.db.getConductors(true) as any;
    const meetingsToInsert = meetings.map((meeting) => {
        delete meeting.id;
        return {
            ...meeting,
            tenantId: this.db.tenant().id,
            attendees: meeting.attendees.map((attendeeId: number) => {
                const conductor = allConductors.find((c: Player) => c.legacyConductorId === attendeeId);
                return conductor ? conductor.id : null;
            }).filter((id: number | null) => id !== null)
        };
    });

    const { error } = await this.db.getSupabase()
        .from('meetings')
        .insert(meetingsToInsert);

    if (error) {
        Utils.showToast(`Fehler beim Hinzufügen der Meetings: ${error.message}`, "danger");
        return;
    }
  }

  async addAttendances(allSongs: Song[]) {
    const allPlayers = await this.db.getPlayers(true);
    const allConductors = await this.db.getConductors(true);
    for (const att of attendances) {
      const personAttendances: PersonAttendance[] = [];
      delete att.id;
      delete att.hasNeutral;
      const lateExcused = att.lateExcused;
      delete att.lateExcused;
      const attendance = {
        ...att,
        tenantId: this.db.tenant().id,
        players: {},
        playerNotes: {},
        excused: [],
        conductors: {},
        songs: att.songs.map((s: number) => allSongs.find((song: Song) => song.legacyId === s)?.id || 0),
      };

      const { data, error } = await this.db.getSupabase()
        .from('attendance')
        .insert(attendance)
        .select()
        .single();

      if (error) {
        Utils.showToast(`Fehler beim Hinzufügen der Anwesenheit: ${error.message}`, "danger");
        return;
      }

      for (const person in att.players) {
        const id: number = Number(person);
        const player = allPlayers.find((p: Player) => p.legacyId === id);
        if (player) {
        personAttendances.push({
          attendance_id: data.id,
          person_id: player.id,
          status: this.getStatus(att, id, lateExcused),
          notes: att.playerNotes[String(id)] ?? ""
        });
        } else {
          debugger;
        }
      }

      for (const cond in att.conductors) {
        const id: number = Number(cond);
        const c = allConductors.find((p: Player) => p.legacyConductorId === id);
        if (c) {
        personAttendances.push({
          attendance_id: data.id,
          person_id: c.id,
          status: this.getStatus(att, id, lateExcused),
          notes: ""
        });
        } else {
          debugger;
        }
      }

      const { error: e } = await this.db.getSupabase()
        .from('person_attendances')
        .insert(personAttendances);

      if (e) {
        Utils.showToast(`Fehler beim Hinzufügen der Person-Anwesenheiten: ${e.message}`, "danger");
        return;
      }
    }
  }

  getStatus(att: Attendance, id: number, lateExcused: string[] = []): AttendanceStatus {
    if (att.players[String(id)] && typeof att.players[String(id)] === "number") {
      if ((lateExcused).includes(String(id))) {
        return AttendanceStatus.LateExcused;
      }

      return att.players[String(id)] as AttendanceStatus;
    }

    if (lateExcused.includes(String(id))) {
      return AttendanceStatus.LateExcused;
    }

    if (att.excused.includes(String(id))) {
      return AttendanceStatus.Excused;
    }

    return att.players[String(id)] === true ? AttendanceStatus.Present : AttendanceStatus.Absent;
  }

  async addSongsAndHistory(allConductors: Person[]) {
    const songsToInsert: Song[] = [];

    for (const song of songs) {
      const id = song.id;
      delete song.id;

      songsToInsert.push({
        ...song,
        tenantId: this.db.tenant().id,
        legacyId: id,
      });
    }

    const { error: songError } = await this.db.getSupabase()
      .from('songs')
      .insert(songsToInsert);

    if (songError) {
      Utils.showToast(`Fehler beim Hinzufügen der Lieder: ${songError.message}`, "danger");
      return;
    }

    const allSongs = await this.db.getSongs();
    const historyToInsert: History[] = [];

    for (const historyEntry of history) {
      const conductorId = historyEntry.conductor;
      delete historyEntry.conductor;
      delete historyEntry.id;
      historyToInsert.push({
        ...historyEntry,
        tenantId: this.db.tenant().id,
        songId: allSongs.find((s: Song) => s.legacyId === historyEntry.songId)?.id || 0,
        person_id: allConductors.find((c: Player) => c.legacyConductorId === conductorId)?.id || null
      });
    }

    const { error: historyError } = await this.db.getSupabase()
      .from('history')
      .insert(historyToInsert);

    if (historyError) {
      Utils.showToast(`Fehler beim Hinzufügen der Historie: ${historyError.message}`, "danger");
      return;
    }
  }

  async addConductors(allInstruments: Instrument[]) {
    const conductorsToInsert: Player[] = [];
    const mainGroup = allInstruments.find((ins: Instrument) => ins.maingroup);
    for (const conductor of conductors) {
      const id = conductor.id;
      delete conductor.appId;
      delete conductor.id;
      conductorsToInsert.push({
        ...conductor,
        tenantId: this.db.tenant().id,
        legacyConductorId: id,
        instrument: mainGroup.id,
        hasTeacher: false,
        playsSince: null,
        isLeader: false,
        isCritical: false,
        history: [],
      });
    }

    const { error: conductorError } = await this.db.getSupabase()
      .from('player')
      .insert(conductorsToInsert);

    if (conductorError) {
      Utils.showToast(`Fehler beim Hinzufügen der Leiter: ${conductorError.message}`, "danger");
      return;
    }
  }

  async syncConductorTenantUsers(allConductors: Player[]) {
    const newTenantUsers: TenantUser[] = [];
    const { data: allTenantUsers } = await this.db.getSupabase()
      .from('tenantUsers')
      .select('*');

    for (const player of allConductors) {
      const found = allTenantUsers.find((tu: TenantUser) => tu.email === player.email);
      if (player.email && found) {
        newTenantUsers.push({
          email: player.email,
          role: Role.RESPONSIBLE,
          tenantId: this.db.tenant().id,
          userId: found.userId,
        });
      }
    }

    if (newTenantUsers.length > 0) {
      const { error: tenantUserError } = await this.db.getSupabase()
        .from('tenantUsers')
        .insert(newTenantUsers);

      if (tenantUserError) {
        Utils.showToast(`Fehler beim Hinzufügen der Tenant-User: ${tenantUserError.message}`, "danger");
        return;
      }

      for (const tu of newTenantUsers) {
        const player = allConductors.find((p: Player) => p.email === tu.email);
        delete player.role;
        await this.db.updatePlayer({
          ...player,
          appId: tu.userId,
        });
      }
    }
  }

  async syncTenantUsers(allPlayers: Player[]) {
    const newTenantUsers: TenantUser[] = [];
    const { data: allTenantUsers } = await this.db.getSupabase()
      .from('tenantUsers')
      .select('*');

    for (const player of allPlayers) {
      const found = allTenantUsers.find((tu: TenantUser) => tu.email === player.email);
      if (player.email && found) {
        newTenantUsers.push({
          email: player.email,
          role: Role.PLAYER,
          tenantId: this.db.tenant().id,
          userId: found.userId,
        });
      }
    }

    if (newTenantUsers.length > 0) {
      const { error: tenantUserError } = await this.db.getSupabase()
        .from('tenantUsers')
        .insert(newTenantUsers);

      if (tenantUserError) {
        Utils.showToast(`Fehler beim Hinzufügen der Tenant-User: ${tenantUserError.message}`, "danger");
        return;
      }

      for (const tu of newTenantUsers) {
        const player = allPlayers.find((p: Player) => p.email === tu.email);
        delete player.role;
        await this.db.updatePlayer({
          ...player,
          appId: tu.userId,
        });
      }
    }
  }

  async addPlayers(allInstruments: Instrument[]) {
    const playersToInsert: Player[] = [];
    const tenantId = this.db.tenant().id;
    for (const player of players) {
      const legacyId = player.id;
      delete player.id;
      delete player.appId;
      delete player.role;

      playersToInsert.push({
        ...player,
        legacyId,
        tenantId,
        img: "https://ionicframework.com/docs/img/demos/avatar.svg",
        instrument: allInstruments.find((ins: Instrument) => ins.legacyId === player.instrument)?.id || 0,
      });
    }

    const { error: playerError } = await this.db.getSupabase()
      .from('player')
      .insert(playersToInsert);

    if (playerError) {
      Utils.showToast(`Fehler beim Hinzufügen der Spieler: ${playerError.message}`, "danger");
      return;
    }
  }

  async addInstruments() {
    const instrumentsToInsert: Instrument[] = [];
    for (const instrument of instruments) {
      const id = instrument.id;
      delete instrument.id;
      instrumentsToInsert.push({
        ...instrument,
        tenantId: this.db.tenant().id,
        maingroup: false,
        legacyId: id,
      });
    }

    const { error: insError } = await this.db.getSupabase()
      .from('instruments')
      .insert(instrumentsToInsert);

    if (insError) {
      Utils.showToast(`Fehler beim Hinzufügen der Instrumente: ${insError.message}`, "danger");
      return;
    }
  }
}

const players = [];
const attendances = [];
const instruments = [];
const conductors = [];
const history = [];
const meetings = [];
const songs = [];
