import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { createClient, SupabaseClient, SupabaseClientOptions, User } from '@supabase/supabase-js';
import axios from 'axios';
import * as dayjs from 'dayjs';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment.prod';
import { DEFAULT_IMAGE, PlayerHistoryType } from '../utilities/constants';
import { Attendance, AuthObject, History, Instrument, Meeting, Person, PersonAttendance, Player, PlayerHistoryEntry, Song, Teacher } from '../utilities/interfaces';
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

  authenticationState = new BehaviorSubject<AuthObject>({
    isConductor: false,
    isHelper: false,
    isPlayer: false,
    login: false,
  });

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
    const { data } = await supabase.auth.getUser();

    if (data?.user?.email) {
      const adminMails: string[] = await this.getConductorMails();
      this.user = data.user;
      const isAdmin: boolean = adminMails.includes(data.user.email.toLowerCase());
      supabase.auth.refreshSession();
      this.authenticationState.next({
        isConductor: isAdmin,
        isHelper: !environment.withSignout && !isAdmin,
        isPlayer: !isAdmin,
        login: true,
      });
    }
  }

  async logout() {
    await supabase.auth.signOut();
    this.authenticationState.next({
      isConductor: false,
      isHelper: false,
      isPlayer: false,
      login: false,
    });

    this.router.navigateByUrl("/login");
  }

  async createAccount(user: Player) {
    try {
      const res = await axios.post(`https://staccato-server.vercel.app/api/registerAttendanceUser`, {
        email: user.email,
        name: `${user.firstName}`,
        appName: environment.shortName,
        url: environment.shortName === "SoS" ? "https://sos.fecg-speyer.de" : "https://bos.fecg-speyer.de",
      });

      if (!res.data?.user?.id) {
        throw new Error('Fehler beim Erstellen eines Accounts');
      }

      const { data, error: updateError } = await supabase
        .from('player')
        .update({
          appId: res.data.user.id
        })
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
      const adminMails: string[] = await this.getConductorMails();
      this.user = data.user;
      const isAdmin: boolean = adminMails.includes(email.toLowerCase());
      this.authenticationState.next({
        isConductor: isAdmin,
        isHelper: !environment.withSignout && !isAdmin,
        isPlayer: !isAdmin,
        login: true,
      });

      this.router.navigateByUrl(adminMails.includes(email.toLowerCase()) ? "/tabs/player" : "/signout");
    } else {
      Utils.showToast("Bitte gib die richtigen Daten an!", "danger");
    }

    return Boolean(data.user);
  }

  async getPlayerByAppId(): Promise<Player> {
    const { data: player, error } = await supabase
      .from('player')
      .select('*')
      .match({ appId: this.user.id })
      .single();

    if (error) {
      Utils.showToast("Es konnte kein Spieler gefunden werden", "danger");
      throw error;
    }

    return {
      ...player,
      history: player.history as any,
    }
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

    const updated: boolean = await this.syncCriticalPlayers(data.map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    }));
    if (updated) {
      return (await this.getPlayers());
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

  async syncCriticalPlayers(players: Player[]): Promise<boolean> {
    const attendances: Attendance[] = (await this.getAttendance()).filter((att: Attendance) => att.type === "uebung");
    let updated: boolean = false;

    for (const player of players) {
      if (attendances[0] && attendances[1] && attendances[2] && !player.isCritical &&
        (!player.lastSolve || dayjs(player.lastSolve).isBefore(dayjs().subtract(15, "days"))) &&
        attendances[0].players.hasOwnProperty(player.id) && !attendances[0].players[player.id] &&
        attendances[1].players.hasOwnProperty(player.id) && !attendances[1].players[player.id] &&
        attendances[2].players.hasOwnProperty(player.id) && !attendances[2].players[player.id]) {

        updated = true;
        let history: PlayerHistoryEntry[] = player.history;

        history.push({
          date: new Date().toISOString(),
          text: "Fehlt oft hintereinander",
          type: PlayerHistoryType.MISSING_OFTEN,
        });
        this.updatePlayer({
          ...player,
          isCritical: true,
          criticalReason: PlayerHistoryType.MISSING_OFTEN,
          history
        });
      }
    }

    return updated;
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
    const { data, error } = await supabase
      .from('conductors')
      .select('email')
      .is("left", null);

    if (error) {
      Utils.showToast("Fehler beim Laden der Dirigenten E-Mails", "danger");
      throw new Error("Fehler beim Laden der Dirigenten E-Mails");
    }

    return data.filter((d: { email: string }) => Boolean(d.email)).map((d: { email: string }) => d.email.toLowerCase()).concat(["eckstaedt98@gmail.com"]);
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
    const { data, error } = await supabase
      .from('player')
      .insert({
        ...player,
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
        att.players[id] = true;
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
        att.conductors[id] = true;
        await this.updateAttendance({ conductors: att.conductors }, att.id);
      }
    }
  }

  async removePlayerFromAttendances(id: number) {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .neq(`players->"${id}"` as any, null);

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
      .neq(`conductors->"${id}"` as any, null);

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

  async removePlayer(id: number): Promise<void> {
    await supabase
      .from('player')
      .delete()
      .match({ id });

    await this.removePlayerFromAttendances(id);
  }

  async removeConductor(id: number): Promise<void> {
    await supabase
      .from('conductors')
      .delete()
      .match({ id });

    await this.removeConductorFromAttendances(id);
  }

  async archivePlayer(player: Player, left: string, notes: string): Promise<void> {
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

  async archiveConductor(id: number, left: string, notes: string): Promise<void> {
    await supabase
      .from('conductors')
      .update({ left, notes })
      .match({ id });
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

  async getAttendance(): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .order("date", {
        ascending: false,
      });

    return data as any;
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
    const { data } = await supabase
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

  async getPlayerAttendance(id: number): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .neq(`players->"${id}"` as any, null)
      .order("date", {
        ascending: false,
      });

    return data.map((att): PersonAttendance => {
      return {
        id: att.id,
        date: att.date,
        attended: att.players[id],
        title: att.typeInfo ? att.typeInfo : att.type === "vortrag" ? "Vortrag" : "",
        text: att.players[id] ? "X" : (att.excused || []).includes(String(id)) ? "E" : "A",
        notes: att.playerNotes && att.playerNotes[id] ? att.playerNotes[id] : "",
      }
    });
  }

  async getConductorAttendance(id: number): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .neq(`conductors->"${id}"` as any, null)
      .order("date", {
        ascending: false,
      });

    return data.map((att): PersonAttendance => {
      return {
        id: att.id,
        date: att.date,
        attended: att.conductors[id],
        title: att.typeInfo ? att.typeInfo : att.type === "vortrag" ? "Vortrag" : "",
        text: att.conductors[id] ? "X" : (att.excused || []).includes(String(id)) ? "E" : "A",
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

  async addHistoryEntry(history: History): Promise<History[]> {
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

  async signout(player: Player, attIds: number[], reason: string): Promise<void> {
    const loading: HTMLIonLoadingElement = await Utils.getLoadingElement();
    loading.present();

    const attendances: Attendance[] = [];

    for (const attId of attIds) {
      const attendance: Attendance = await this.getAttendanceById(attId);
      attendances.push(attendance);
      attendance.players[player.id] = false;
      attendance.playerNotes[player.id] = reason;
      attendance.excused.push(String(player.id));

      await this.updateAttendance(attendance, attId);
    }

    this.notifyPerTelegram(player, attendances, "signout", reason);

    loading.dismiss();
  }

  async signin(player: Player, attId: number): Promise<void> {
    const attendance: Attendance = await this.getAttendanceById(attId);
    attendance.players[player.id] = true;
    delete attendance.playerNotes[player.id];
    attendance.excused = attendance.excused.filter((playerId: string) => playerId !== String(player.id));

    this.notifyPerTelegram(player, [attendance]);

    await this.updateAttendance(attendance, attId);
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
    const { data, error } = await supabase
      .from("history")
      .select(`
        id,
        conductors (
          firstName, lastName
        ),
        date,
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
        conductorName: `${his.conductors.firstName} ${his.conductors.lastName}`,
      };
    });
  }
}
