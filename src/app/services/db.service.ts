import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { createClient, SupabaseClient, SupabaseClientOptions, User } from '@supabase/supabase-js';
import axios from 'axios';
import * as dayjs from 'dayjs';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment.prod';
import { AttendanceStatus, DEFAULT_IMAGE, PlayerHistoryType, Role, SupabaseTable } from '../utilities/constants';
import { Attendance, AuthObject, History, Instrument, Meeting, Person, PersonAttendance, Player, PlayerHistoryEntry, Settings, Song, Teacher, Viewer } from '../utilities/interfaces';
import { Database } from '../utilities/supabase';
import { Utils } from '../utilities/Utils';

const options: SupabaseClientOptions<any> = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
}
const supabase = createClient<Database>(environment.apiUrl, environment.apiKey, options);

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private user: User;
  private conductorMails: string[] = [];
  authenticationState = new BehaviorSubject<AuthObject>({
    role: Role.NONE,
    login: false,
  });
  public attDate: string;
  private settings: Settings;

  constructor(
    private plt: Platform,
    private router: Router,
  ) {
    this.plt.ready().then(() => {
      this.checkToken();
    });
  }

  getSupabase(): SupabaseClient {
    return supabase;
  }

  async checkToken() {
    if (this.authenticationState.getValue().login) {
      return;
    }
    const { data } = await supabase.auth.getUser();

    if (data?.user?.email) {
      this.user = data.user;
      const role: Role = await this.getRole();
      if (this.authenticationState.getValue().role !== role) {
        this.authenticationState.next({
          role,
          login: true,
        });
      }
    }
  }

  async logout() {
    await supabase.auth.signOut();
    this.authenticationState.next({
      role: Role.NONE,
      login: false,
    });

    this.router.navigateByUrl("/login");
  }

  async getViewers(): Promise<Viewer[]> {
    const { data, error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .select('*');

    if (error) {
      Utils.showToast("Fehler beim Laden der Beobachter", "danger");
      throw error;
    }

    return data;
  }

  async createViewer(viewer: Partial<Viewer>) {
    const appId: string = await this.registerUser(viewer.email as string, viewer.firstName as string);

    const { error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .insert({
        ...viewer,
        appId
      });

    if (error) {
      throw new Error("Fehler beim hinzufügen des Beobachters.");
    }
  }

  async registerUser(email: string, name: string): Promise<string> {
    try {
      const res = await axios.post(`https://staccato-server.vercel.app/api/registerAttendanceUser`, {
        email,
        name,
        appName: environment.longName,
        shortName: environment.shortName,
        url: Utils.getUrlByShortName(environment.shortName),
      });

      if (!res.data?.user?.id) {
        throw new Error('Fehler beim Erstellen des Accounts');
      }

      return res.data.user.id;
    } catch (_) {
      throw new Error("Die E-Mail Adresse wird bereits verwendet");
    }
  }

  async createAccount(user: Player, table: SupabaseTable = SupabaseTable.PLAYER) {
    try {
      const appId: string = await this.registerUser(user.email as string, user.firstName);

      const { data, error: updateError } = await supabase
        .from(table)
        .update({ appId })
        .match({ id: user.id })
        .select()
        .single();

      if (updateError) {
        throw new Error('Fehler beim updaten des Benutzers');
      }

      return data;
    } catch (error) {
      throw new Error(error);
    }
  }

  async login(email: string, password: string) {
    const { data } = await supabase.auth.signInWithPassword({
      email, password,
    });

    if (data.user) {
      this.user = data.user;
      const role: Role = await this.getRole();
      this.authenticationState.next({
        role,
        login: true,
      });

      this.router.navigateByUrl(Utils.getUrl(role));
    } else {
      Utils.showToast("Bitte gib die richtigen Daten an!", "danger");
    }

    return Boolean(data.user);
  }

  async getRole(): Promise<Role> {
    const adminMails: string[] = await this.getConductorMails();
    const isAdmin: boolean = adminMails.includes((this.user.email || "").toLowerCase());

    if (isAdmin) {
      return Role.ADMIN;
    }

    const profile: Player | undefined = await this.getPlayerProfile();

    if (profile) {
      return profile.role === Role.HELPER ? Role.HELPER : Role.PLAYER;
    } else {
      return Role.VIEWER;
    }
  }

  async getPlayerProfile(): Promise<Player | undefined> {
    try {
      const player: Player = await this.getPlayerByAppId(false);
      return player;
    } catch (_) {
      return undefined;
    }
  }

  async getCurrentAttDate(): Promise<string> {
    await this.getSettings();
    return this.settings?.attDate || dayjs("2023-01-01").toISOString();
  }

  setCurrentAttDate(date: string) {
    this.attDate = date;
  }

  async getPlayerByAppId(showToast: boolean = true): Promise<Player> {
    const { data: player, error } = await supabase
      .from('player')
      .select('*')
      .match({ appId: this.user.id })
      .single();

    if (error) {
      if (showToast) {
        Utils.showToast("Es konnte kein Spieler gefunden werden.", "danger");
      }
      throw error;
    }

    return {
      ...player,
      history: player.history as any,
    }
  }

  async getConductorByAppId(showToast: boolean = true): Promise<Person> {
    const { data: conductor, error } = await supabase
      .from(SupabaseTable.CONDUCTORS)
      .select('*')
      .match({ appId: this.user.id })
      .single();

    if (error) {
      if (showToast) {
        Utils.showToast("Es konnte kein Spieler gefunden werden.", "danger");
      }
      throw error;
    }

    return conductor;
  }

  async getPlayers(all: boolean = false): Promise<Player[]> {
    if (all) {
      const { data, error } = await supabase
        .from('player')
        .select('*');

      if (error) {
        Utils.showToast("Fehler beim Laden der Spieler", "danger");
        throw error;
      }

      return data.map((player) => {
        return {
          ...player,
          history: player.history as any,
        }
      });
    }

    const { data, error } = await supabase
      .from('player')
      .select('*')
      .is("left", null)
      .order("instrument")
      .order("isLeader", {
        ascending: false
      })
      .order("lastName");

    if (error) {
      Utils.showToast("Fehler beim Laden der Spieler", "danger");
    }

    return data.map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    });
  }

  async resetPassword(email: string) {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    loading.dismiss();

    if (error) {
      Utils.showToast("Fehler beim Zurücksetzen des Passworts. Versuche es später erneut", "danger");
      return;
    }

    Utils.showToast("Eine E-Mail mit weiteren Anweisungen wurde dir zugesandt", 'success', 4000);
  }

  async updatePassword(password: string) {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const { data, error } = await supabase.auth.updateUser({
      password,
    });

    loading.dismiss();

    if (data) { Utils.showToast('Passwort wurde erfolgreich aktualisiert', 'success'); }
    if (error) { Utils.showToast('Fehler beim zurücksetzen, versuche es noch einmal', "danger"); }
  }

  async syncCriticalPlayers(): Promise<boolean> {
    const res = await axios.post(`https://staccato-server.vercel.app/api/syncCriticalPlayers`, {
      isChoir: environment.isChoir,
      shortName: environment.shortName,
    });

    if (res.status !== 200) {
      throw new Error('Fehler beim Löschen des Accounts');
    }

    return res.data.updated;
  }

  async getLeftPlayers(): Promise<Player[]> {
    const { data } = await supabase
      .from('player')
      .select('*')
      .not("left", "is", null)
      .order("left", {
        ascending: false,
      });

    return data.map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    });
  }

  async getPlayersWithoutAccount(): Promise<Player[]> {
    const { data } = await supabase
      .from('player')
      .select('*')
      .not("email", "is", null)
      .is("appId", null)
      .is("left", null);

    return data.map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    }).filter((p: Player) => p.email.length);
  }

  async getConductorMails(): Promise<string[]> {
    if (this.conductorMails?.length) {
      return this.conductorMails;
    }

    const { data, error } = await supabase
      .from('conductors')
      .select('email')
      .is("left", null);

    if (error) {
      Utils.showToast("Fehler beim Laden der Dirigenten E-Mails", "danger");
      throw new Error("Fehler beim Laden der Dirigenten E-Mails");
    }

    this.conductorMails = data.filter((d: { email: string }) => Boolean(d.email)).map((d: { email: string }) => d.email.toLowerCase()).concat(["eckstaedt98@gmail.com"]);
    return this.conductorMails;
  }

  async getConductors(all: boolean = false): Promise<Person[]> {
    const response = await supabase
      .from('conductors')
      .select('*')
      .order("lastName");

    return (all ? response.data : response.data.filter((c: Person) => !c.left)).map((con: Person) => { return { ...con, img: con.img || DEFAULT_IMAGE } });
  }

  async addConductor(person: Person): Promise<void> {
    const dataToCreate: any = { ...person };
    delete dataToCreate.hasTeacher;
    delete dataToCreate.instrument;
    delete dataToCreate.isLeader;
    delete dataToCreate.history;
    delete dataToCreate.isCritical;
    delete dataToCreate.notes;
    delete dataToCreate.paused;
    delete dataToCreate.teacher;
    delete dataToCreate.playsSince;

    const { error, data } = await supabase
      .from('conductors')
      .insert(dataToCreate)
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim hinzufügen des Dirigenten.");
    }

    await this.addConductorToUpcomingAttendances(data.id);

    return;
  }

  async addPlayer(player: Player): Promise<void> {
    if (!environment.showTeachers) {
      delete player.teacher;
    }

    const { data, error } = await supabase
      .from('player')
      .insert({
        ...player,
        id: Utils.getId(),
        history: player.history as any
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await this.addPlayerToUpcomingAttendances(data.id);
  }

  async addPlayerToUpcomingAttendances(id: number) {
    const attData: Attendance[] = await this.getUpcomingAttendances();

    if (attData?.length) {
      for (const att of attData) {
        att.players[id] = AttendanceStatus.Present;
        await this.updateAttendance({ players: att.players }, att.id);
      }
    }
  }

  async removePlayerFromUpcomingAttendances(id: number) {
    const attData: Attendance[] = await this.getUpcomingAttendances();

    if (attData?.length) {
      for (const att of attData) {
        delete att.players[id];
        await this.updateAttendance({ players: att.players }, att.id);
      }
    }
  }

  async addConductorToUpcomingAttendances(id: number) {
    const attData: Attendance[] = await this.getUpcomingAttendances();

    if (attData?.length) {
      for (const att of attData) {
        att.conductors[id] = AttendanceStatus.Present;
        await this.updateAttendance({ conductors: att.conductors }, att.id);
      }
    }
  }

  async removePlayerFromAttendances(id: number) {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .neq(`players->>"${id}"` as any, null);

    if (data?.length) {
      for (const att of data) {
        delete att.players[id];
        await this.updateAttendance({ players: att.players as any }, att.id);
      }
    }
  }

  async removeConductorFromAttendances(id: number) {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .neq(`conductors->>"${id}"` as any, null);

    if (data?.length) {
      for (const att of data) {
        delete att.conductors[id];
        await this.updateAttendance({ conductors: att.conductors as any }, att.id);
      }
    }
  }

  async updatePlayer(player: Player, pausedAction?: boolean): Promise<Player[]> {
    const dataToUpdate: Player = { ...player };
    delete dataToUpdate.id;
    delete dataToUpdate.created_at;
    delete dataToUpdate.instrumentName;
    delete dataToUpdate.firstOfInstrument;
    delete dataToUpdate.isNew;
    delete dataToUpdate.instrumentLength;
    delete dataToUpdate.teacherName;
    delete dataToUpdate.criticalReasonText;
    delete dataToUpdate.isPresent;
    delete dataToUpdate.text;
    delete dataToUpdate.attStatus;

    const { data, error } = await supabase
      .from('player')
      .update({
        ...dataToUpdate,
        history: dataToUpdate.history as any,
      })
      .match({ id: player.id })
      .select();

    if (error) {
      throw new Error("Fehler beim updaten des Spielers");
    }

    if (pausedAction) {
      if (player.paused) {
        this.removePlayerFromUpcomingAttendances(player.id);
      } else {
        this.addPlayerToUpcomingAttendances(player.id);
      }
    }

    return data.map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    });
  }

  async updateConductor(person: Person): Promise<Person[]> {
    const dataToUpdate: any = { ...person };
    delete dataToUpdate.id;
    delete dataToUpdate.created_at;
    delete dataToUpdate.instrumentName;
    delete dataToUpdate.firstOfInstrument;
    delete dataToUpdate.isNew;
    delete dataToUpdate.instrumentLength;
    delete dataToUpdate.teacherName;
    delete dataToUpdate.criticalReasonText;
    delete dataToUpdate.isPresent;
    delete dataToUpdate.text;

    const { data, error } = await supabase
      .from('conductors')
      .update(dataToUpdate)
      .match({ id: person.id })
      .select();

    if (error) {
      throw new Error("Fehler beim updaten des Dirigenten");
    }

    return data;
  }

  async updatePlayerHistory(id: number, history: PlayerHistoryEntry[]) {
    const { data, error } = await supabase
      .from('player')
      .update({ history: history as any[] })
      .match({ id })
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim updaten des Spielers");
    }

    return data;
  }

  async removePlayer(player: Person): Promise<void> {
    await supabase
      .from('player')
      .delete()
      .match({ id: player.id });

    await this.removePlayerFromAttendances(player.id);
    if (player.appId) {
      await this.removeEmailFromAuth(player.appId);
    }
  }

  async removeEmailFromAuth(appId: string) {
    const res = await axios.post(`https://staccato-server.vercel.app/api/deleteUserFromAuth`, {
      id: appId,
      appShortName: environment.shortName,
    });

    if (res.status !== 200) {
      throw new Error('Fehler beim Löschen des Accounts');
    }
  }

  async removeConductor(conductor: Person): Promise<void> {
    await supabase
      .from('conductors')
      .delete()
      .match({ id: conductor.id });

    await this.removeConductorFromAttendances(conductor.id);
    if (conductor.appId) {
      await this.removeEmailFromAuth(conductor.appId);
    }
  }

  async archivePlayer(player: Player, left: string, notes: string): Promise<void> {
    if (player.appId && player.email) {
      await this.removeEmailFromAuth(player.email);
      delete player.appId;
      delete player.email;
    }

    if ((player.notes || "") !== notes) {
      player.history.push({
        date: new Date().toISOString(),
        text: player.notes || "Keine Notiz",
        type: PlayerHistoryType.NOTES,
      });
    }

    await supabase
      .from('player')
      .update({ left, notes, history: player.history as any })
      .match({ id: player.id });
  }

  async archiveConductor(conductor: Person, left: string, notes: string): Promise<void> {
    if (conductor.appId && conductor.email) {
      await this.removeEmailFromAuth(conductor.email);
      delete conductor.appId;
      delete conductor.email;
    }

    await supabase
      .from(SupabaseTable.CONDUCTORS)
      .update({ left, notes })
      .match({ id: conductor.id });
  }

  async getInstruments(): Promise<Instrument[]> {
    const { data } = await supabase
      .from('instruments')
      .select('*')
      .order("name");

    return data;
  }

  async addInstrument(name: string): Promise<Instrument[]> {
    const { data } = await supabase
      .from('instruments')
      .insert({
        name,
        tuning: "C",
        clefs: ["g"],
      })
      .select();

    return data;
  }

  async updateInstrument(att: Partial<Instrument>, id: number): Promise<Instrument[]> {
    const { data } = await supabase
      .from('instruments')
      .update(att)
      .match({ id })
      .select();

    return data;
  }

  async removeInstrument(id: number): Promise<Instrument[]> {
    const { data } = await supabase
      .from('instruments')
      .delete()
      .match({ id });

    return data;
  }

  async addAttendance(attendance: Attendance): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .insert(attendance as any)
      .select();

    return data as any;
  }

  async getAttendance(all: boolean = false): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .gt("date", all ? dayjs("2020-01-01").toISOString() : await this.getCurrentAttDate())
      .order("date", {
        ascending: false,
      });

    return data.map((att: any): Attendance => {
      if (att.plan) {
        att.plan.time = dayjs(att.plan.time).isValid() ? dayjs(att.plan.time).format("HH:mm") : att.plan.time;
      }
      return att;
    });
  }

  async getUpcomingAttendances(): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .gt("date", dayjs().startOf("day").toISOString())
      .order("date", {
        ascending: false,
      });

    return data as any;
  }

  async getAttendanceById(id: number): Promise<Attendance> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .match({ id })
      .order("date", {
        ascending: false,
      })
      .single();

    return data as any;
  }

  async updateAttendance(att: Partial<Attendance>, id: number): Promise<Attendance[]> {
    const { data, error } = await supabase
      .from('attendance')
      .update(att as any)
      .match({ id })
      .select();

    return data as any;
  }

  async removeAttendance(id: number): Promise<void> {
    await supabase
      .from('attendance')
      .delete()
      .match({ id });
  }

  async getPlayerAttendance(id: number, all: boolean = false): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .neq(`players->>"${id}"` as any, null)
      .gt("date", all ? dayjs("2020-01-01").toISOString() : await this.getCurrentAttDate())
      .order("date", {
        ascending: false,
      });

    return data.map((att): PersonAttendance => {
      let attText;
      if (typeof att.players[String(id)] == 'boolean') {
        if ((att.excused || []).includes(String(id))) {
          attText = 'E';
        } else if ((att.excused || []).includes(String(id))) {
          attText = 'L';
        } else if (att.players[String(id)] === true) {
          attText = 'X';
        } else {
          attText = 'A';
        }
      }
      if (!attText) {
        attText = att.players[id] === 0 ? 'N' : att.players[id] === 1 ? 'X' : att.players[id] === 2 ? 'E' : att.players[id] === 3 ? 'L' : 'A'
      }

      return {
        id: att.id,
        date: att.date,
        attended: attText === "L" || attText === "X",
        title: att.typeInfo ? att.typeInfo : att.type === "vortrag" ? "Vortrag" : "",
        text: attText,
        notes: att.playerNotes && att.playerNotes[id] ? att.playerNotes[id] : "",
      }
    });
  }

  async getConductorAttendance(id: number, all: boolean = false): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .neq(`conductors->>"${id}"` as any, null)
      .gt("date", all ? dayjs("2020-01-01").toISOString() : await this.getCurrentAttDate())
      .order("date", {
        ascending: false,
      });

    return data.map((att): PersonAttendance => {
      let attText;
      if (typeof att.conductors[String(id)] == 'boolean') {
        if ((att.excused || []).includes(String(id))) {
          attText = 'E';
        } else if ((att.excused || []).includes(String(id))) {
          attText = 'L';
        } else if (att.conductors[String(id)] === true) {
          attText = 'X';
        } else {
          attText = 'A';
        }
      }
      if (!attText) {
        attText = att.conductors[id] === 0 ? 'N' : att.conductors[id] === 1 ? 'X' : att.conductors[id] === 2 ? 'E' : att.conductors[id] === 3 ? 'L' : 'A'
      }

      return {
        id: att.id,
        date: att.date,
        attended: attText === "L" || attText === "X",
        title: att.typeInfo ? att.typeInfo : att.type === "vortrag" ? "Vortrag" : "",
        text: attText,
        notes: "",
      }
    });
  }

  async getHistory(): Promise<History[]> {
    const { data } = await supabase
      .from('history')
      .select('*')
      .order("date", {
        ascending: false,
      });

    return data;
  }

  async addHistoryEntry(history: History[]): Promise<History[]> {
    const { data } = await supabase
      .from('history')
      .insert(history)
      .select();

    return data;
  }

  async removeHistoryEntry(id: number): Promise<History[]> {
    const { data, error } = await supabase
      .from('history')
      .delete()
      .match({ id });

    if (error) {
      throw new Error("Fehler beim Löschen des Eintrags");
    }

    return data;
  }

  async getTeachers(): Promise<Teacher[]> {
    const { data } = await supabase
      .from('teachers')
      .select('*')
      .order("name", {
        ascending: true,
      });

    return data;
  }

  async addTeacher(teacher: Teacher): Promise<Teacher[]> {
    const { data } = await supabase
      .from('teachers')
      .insert(teacher)
      .select();

    return data;
  }

  async updateTeacher(teacher: Partial<Teacher>, id: number): Promise<Teacher[]> {
    delete teacher.insNames;

    const { data } = await supabase
      .from('teachers')
      .update(teacher)
      .match({ id });

    return data;
  }

  async getSongs(): Promise<Song[]> {
    const response = await supabase
      .from('songs')
      .select('*')
      .order("number", {
        ascending: true,
      });

    return response.data;
  }

  async addSong(song: Song): Promise<Song[]> {
    const { data } = await supabase
      .from('songs')
      .insert(song)
      .select();

    return data;
  }

  async editSong(id: number, song: Song): Promise<Song[]> {
    const { data } = await supabase
      .from('songs')
      .update(song)
      .match({ id });

    return data;
  }

  async getMeetings(): Promise<Meeting[]> {
    const response = await supabase
      .from('meetings')
      .select('*')
      .order("date", {
        ascending: true,
      });

    return response.data;
  }

  async getMeeting(id: number): Promise<Meeting> {
    const response = await supabase
      .from('meetings')
      .select('*')
      .match({ id })
      .single();

    return response.data;
  }

  async addMeeting(meeting: Meeting): Promise<Meeting[]> {
    const { data } = await supabase
      .from('meetings')
      .insert(meeting)
      .select();

    return data;
  }

  async editMeeting(id: number, meeting: Meeting): Promise<Meeting[]> {
    const { data } = await supabase
      .from('meetings')
      .update(meeting)
      .match({ id });

    return data;
  }

  async removeMeeting(id: number): Promise<void> {
    await supabase
      .from('meetings')
      .delete()
      .match({ id });

    return;
  }

  async signout(player: Player, attIds: number[], reason: string, isLateExcused: boolean): Promise<void> {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
    loading.present();
    const attendances: Attendance[] = [];

    for (const attId of attIds) {
      const attendance: Attendance = await this.getAttendanceById(attId);
      attendances.push(attendance);
      attendance.players[player.id] = isLateExcused === true ? AttendanceStatus.Late : AttendanceStatus.Excused;
      attendance.playerNotes[player.id] = reason;

      await this.updateAttendance(attendance, attId);
    }

    this.notifyPerTelegram(player, attendances, isLateExcused === true ? 'lateSignout' : "signout", reason);

    loading.dismiss();
  }

  async signin(player: Player, attId: number): Promise<void> {
    const attendance: Attendance = await this.getAttendanceById(attId);
    attendance.players[player.id] = AttendanceStatus.Present;
    delete attendance.playerNotes[player.id];
    const playerIsLateExcused = attendance.lateExcused.includes(String(player.id));
    attendance.excused = attendance.excused.filter((playerId: string) => playerId !== String(player.id));
    attendance.lateExcused = attendance.lateExcused.filter((playerId: string) => playerId !== String(player.id));

    this.notifyPerTelegram(player, [attendance], playerIsLateExcused === true ? 'lateSignin' : 'signin');

    await this.updateAttendance(attendance, attId);
  }

  async sendPlanPerTelegram(blob: Blob, name: string): Promise<void> {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement(99999);
    await loading.present();
    const fileName: string = name + "_" + Math.floor(Math.random() * 100) + ".pdf";

    const { error } = await supabase.storage
      .from("attendances")
      .upload(fileName, blob, { upsert: true });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = await supabase
      .storage
      .from("attendances")
      .getPublicUrl(fileName);

    const res = await axios.post(`https://staccato-server.vercel.app/api/sendPracticePlan`, {
      url: data.publicUrl,
      shortName: environment.shortName,
    });

    loading.dismiss();

    if (res.status === 200) {
      Utils.showToast("Nachricht wurde erfolgreich gesendet!");
    } else {
      Utils.showToast("Fehler beim Senden der Nachricht, versuche es später erneut!", "danger");
    }

    window.setTimeout(async () => {
      await supabase.storage
        .from("attendances")
        .remove([fileName]);
    }, 10000);
  }

  async notifyPerTelegram(player: Player, attendances: Attendance[], type: string = "signin", reason?: string): Promise<void> {
    await axios.post(`https://staccato-server.vercel.app/api/notifyAttendanceOwner`, {
      name: `${player.firstName} ${player.lastName}`,
      appName: environment.shortName,
      dates: attendances.map((attendance: Attendance) => `${dayjs(attendance.date).format("DD.MM.YYYY")}${Utils.getAttendanceText(attendance) ? " " + Utils.getAttendanceText(attendance) : ""}`),
      type,
      reason,
    });
  }

  async removeImage(id: number, imgPath: string, isConductor: boolean) {
    if (isConductor) {
      await supabase
        .from("conductors")
        .update({ img: "" })
        .match({ id });
    } else {
      await supabase
        .from("player")
        .update({ img: "" })
        .match({ id });
    }

    await supabase.storage
      .from("profiles")
      .remove([`${isConductor ? "con_" : ""}${id}`]);
  }

  async updateImage(id: number, image: File, isConductor: boolean) {
    const fileName: string = `${isConductor ? "con_" : ""}${id}`;

    const { error } = await supabase.storage
      .from("profiles")
      .upload(fileName, image, { upsert: true });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = await supabase
      .storage
      .from("profiles")
      .getPublicUrl(fileName);

    if (isConductor) {
      await supabase
        .from("conductors")
        .update({ img: data.publicUrl })
        .match({ id });
    } else {
      await supabase
        .from("player")
        .update({ img: data.publicUrl })
        .match({ id });
    }

    return data.publicUrl;
  }

  async updateAttImage(id: number, image: File) {
    const { error } = await supabase.storage
      .from("attendances")
      .upload(id.toString(), image, { upsert: true });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = await supabase
      .storage
      .from("attendances")
      .getPublicUrl(id.toString());

    await supabase
      .from("attendance")
      .update({ img: data.publicUrl })
      .match({ id });

    return data.publicUrl;
  }

  async getUpcomingHistory(): Promise<History[]> {
    const { data, error } = await (supabase as any)
      .from("history")
      .select(`
        id,
        conductors (
          firstName, lastName
        ),
        date,
        otherConductor,
        songId
      `)
      .gt("date", dayjs().startOf("day").toISOString())
      .order("date", {
        ascending: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    return data.map((his: any) => {
      return {
        ...his,
        conductorName: his.conductors ? `${his.conductors.firstName} ${his.conductors.lastName}` : his.otherConductor || "",
      };
    });
  }

  async getSettings(): Promise<Settings> {
    if (this.settings) {
      return this.settings;
    }

    const response = await supabase
      .from('settings')
      .select('*')
      .match({ id: 1 })
      .single();

    this.settings = response.data;
    return this.settings;
  }

  async updateSettings(settings: Partial<Settings>): Promise<void> {
    const { data } = await supabase
      .from('settings')
      .update(settings)
      .match({ id: 1 })
      .select()
      .single();

    this.settings = data;
  }
}
