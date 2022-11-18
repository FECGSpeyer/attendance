import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment.prod';
import { Attendance, History, Instrument, Person, PersonAttendance, Player, Teacher } from '../utilities/interfaces';

const adminMails: string[] = ["eckstaedt98@gmail.com", "erwinfast98@gmail.com", "eugen.ko94@yahoo.de"];
const options: SupabaseClientOptions = {
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
}
const supabase = createClient(environment.apiUrl, environment.apiKey, options);

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private instruments: Instrument[] = [];
  private attendance: Attendance[] = [];
  private history: History[] = [];

  authenticationState = new BehaviorSubject({
    isConductor: false,
    isPlayer: false,
    login: false,
  });

  constructor(
    private plt: Platform
  ) {
    this.plt.ready().then(() => {
      this.checkToken();
    });
  }

  async checkToken() {
    const res = await supabase.auth.user();

    if (res?.email) {
      supabase.auth.refreshSession();
      this.authenticationState.next({
        isConductor: adminMails.includes(res.email.toLowerCase()),
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
  }

  async register(email: string, password: string) {
    const res = await supabase.auth.signUp({
      email, password,
    });

    return Boolean(res.user);
  }

  async login(email: string, password: string) {
    const res = await supabase.auth.signIn({
      email, password,
    });

    if (res.user) {
      this.authenticationState.next({
        isConductor: adminMails.includes(email.toLowerCase()),
        isPlayer: true,
        login: true,
      });
    }

    return Boolean(res.user);
  }

  async getPlayers(): Promise<Player[]> {
    const response = await supabase
      .from<Player>('player')
      .select('*')
      .is("left", null)
      .order("instrument")
      .order("lastName");

    return response.data;
  }

  async getLeftPlayers(): Promise<Player[]> {
    const response = await supabase
      .from<Player>('player')
      .select('*')
      .not("left", "is", null)
      .order("left", {
        ascending: false,
      });

    return response.data;
  }

  async getConductors(all: boolean = false): Promise<Person[]> {
    const response = await supabase
      .from<Person>('conductors')
      .select('*')
      .order("lastName");

    return all ? response.data : response.data.filter((c: Person) => !c.isInactive);
  }

  async addPlayer(player: Player): Promise<Player[]> {
    const response = await supabase
      .from<Player>('player')
      .insert(player);

    return response.body;
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

    const response = await supabase
      .from<Player>('player')
      .update(dataToUpdate)
      .match({ id: player.id });

    return response.body;
  }

  async removePlayer(id: number): Promise<void> {
    await supabase
      .from<Player>('player')
      .delete()
      .match({ id });
  }

  async archivePlayer(id: number): Promise<void> {
    await supabase
      .from<Player>('player')
      .update({ left: new Date().toISOString() })
      .match({ id });
  }

  async getInstruments(reload: boolean = false): Promise<Instrument[]> {
    if (this.instruments.length && !reload) {
      return this.instruments;
    }

    const response = await supabase
      .from<Instrument>('instruments')
      .select('*')
      .order("name");

    this.instruments = response.data;
    return this.instruments;
  }

  async addInstrument(name: string): Promise<Instrument[]> {
    const response = await supabase
      .from<Instrument>('instruments')
      .insert({
        name,
        tuning: "C",
        clefs: ["g"],
      });

    return response.body;
  }

  async updateInstrument(att: Partial<Instrument>, id: number): Promise<Instrument[]> {
    const response = await supabase
      .from<Instrument>('instruments')
      .update(att)
      .match({ id });

    return response.body;
  }

  async addAttendance(attendance: Attendance): Promise<Attendance[]> {
    const response = await supabase
      .from<Attendance>('attendance')
      .insert(attendance);

    return response.body;
  }

  async getAttendance(reload: boolean = false): Promise<Attendance[]> {
    if (this.attendance.length && !reload) {
      return this.attendance;
    }

    const response = await supabase
      .from<Attendance>('attendance')
      .select('*')
      .order("date", {
        ascending: false,
      });

    this.attendance = response.data;
    return this.attendance;
  }

  async updateAttendance(att: Partial<Attendance>, id: number): Promise<Attendance[]> {
    const response = await supabase
      .from<Attendance>('attendance')
      .update(att)
      .match({ id });

    return response.body;
  }

  async removeAttendance(id: number): Promise<void> {
    await supabase
      .from<Attendance>('attendance')
      .delete()
      .match({ id });
  }

  async getPlayerAttendance(id: number): Promise<PersonAttendance[]> {
    const response = await supabase
      .from<Attendance>('attendance')
      .select('*')
      .neq(`players->"${id}"` as any, null)
      .order("date", {
        ascending: false,
      });

    return response.body.map((att: Attendance): PersonAttendance => {
      return {
        id,
        date: att.date,
        attended: att.players[id],
      }
    });
  }

  async getHistory(reload: boolean = false): Promise<History[]> {
    if (this.history.length && !reload) {
      return this.history;
    }

    const response = await supabase
      .from<History>('history')
      .select('*')
      .order("date", {
        ascending: false,
      });

    this.history = response.data;
    return this.history;
  }

  async addHistoryEntry(history: History): Promise<History[]> {
    const response = await supabase
      .from<History>('history')
      .insert(history);

    return response.body;
  }

  async getTeachers(): Promise<Teacher[]> {
    const response = await supabase
      .from<Teacher>('teachers')
      .select('*')
      .order("name", {
        ascending: true,
      });

    return response.data;
  }

  async addTeacher(teacher: Teacher): Promise<Teacher[]> {
    const response = await supabase
      .from<Teacher>('teachers')
      .insert(teacher);

    return response.body;
  }

  async updateTeacher(teacher: Partial<Teacher>, id: number): Promise<Teacher[]> {
    delete teacher.insNames;

    const response = await supabase
      .from<Teacher>('teachers')
      .update(teacher)
      .match({ id });

    return response.body;
  }
}
