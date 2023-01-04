import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';
import * as dayjs from 'dayjs';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment.prod';
import { PlayerHistoryType } from '../utilities/constants';
import { Attendance, History, Instrument, Person, PersonAttendance, Player, PlayerHistoryEntry, Song, Teacher } from '../utilities/interfaces';
import { Database } from '../utilities/supabase';
import { Utils } from '../utilities/Utils';

const adminMails: string[] = ["leonjaeger00@gmail.com", "emanuel.ellrich@gmail.com", "jaeger1390@gmail.com", "Ericfast.14@gmail.com", "marcelfast2002@gmail.com", "eckstaedt98@gmail.com", "erwinfast98@gmail.com", "eugen.ko94@yahoo.de"];
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
  private attendance: Attendance[] = [];

  authenticationState = new BehaviorSubject({
    isConductor: false,
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

  async checkToken() {
    const { data } = await supabase.auth.getUser();

    if (data?.user?.email) {
      supabase.auth.refreshSession();
      this.authenticationState.next({
        isConductor: adminMails.includes(data.user.email.toLowerCase()),
        isPlayer: true,
        login: false,
      });
    }
  }

  async logout() {
    await supabase.auth.signOut();
    this.authenticationState.next({
      isConductor: false,
      isPlayer: false,
      login: false,
    });

    this.router.navigateByUrl("/login");
  }

  async register(email: string, password: string) {
    const { data } = await supabase.auth.signUp({
      email, password,
    });

    return Boolean(data.user);
  }

  async login(email: string, password: string) {
    const { data } = await supabase.auth.signInWithPassword({
      email, password,
    });

    if (data.user) {
      this.authenticationState.next({
        isConductor: adminMails.includes(email.toLowerCase()),
        isPlayer: true,
        login: true,
      });

      this.router.navigateByUrl(adminMails.includes(email.toLowerCase()) ? "/tabs/player" : "/tabs/attendance");
    } else {
      Utils.showToast("Bitte gib die richtigen Daten an!", "danger");
    }

    return Boolean(data.user);
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

  async getConductors(all: boolean = false): Promise<Person[]> {
    const response = await supabase
      .from('conductors')
      .select('*')
      .order("lastName");

    return all ? response.data : response.data.filter((c: Person) => !c.isInactive);
  }

  async addPlayer(player: Player): Promise<Player[]> {
    const { data } = await supabase
      .from('player')
      .insert({
        ...player,
        history: player.history as any
      })
      .select();

    return data.map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    });
  }

  async updatePlayer(player: Player): Promise<Player[]> {
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

    return data.map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    });
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
  }

  async archivePlayer(id: number): Promise<void> {
    await supabase
      .from('player')
      .update({ left: new Date().toISOString() })
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

  async getAttendance(reload: boolean = false): Promise<Attendance[]> {
    if (this.attendance.length && !reload) {
      return this.attendance;
    }

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .order("date", {
        ascending: false,
      });

    this.attendance = data as any;
    return this.attendance;
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
        id,
        date: att.date,
        attended: att.players[id],
        title: att.notes ? att.notes : att.type === "vortrag" ? "Vortrag" : "",
        text: att.players[id] ? "X" : (att.excused || []).includes(String(id)) ? "E" : "A",
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
}
