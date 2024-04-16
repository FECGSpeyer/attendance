import { Injectable, WritableSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { createClient, SupabaseClient, SupabaseClientOptions, User } from '@supabase/supabase-js';
import axios from 'axios';
import * as dayjs from 'dayjs';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AttendanceStatus, DEFAULT_IMAGE, PlayerHistoryType, Role, SupabaseTable } from '../utilities/constants';
import { Attendance, AuthObject, History, Instrument, Meeting, Person, PersonAttendance, Player, PlayerHistoryEntry, Song, Teacher, Tenant, TenantUser, Viewer } from '../utilities/interfaces';
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
  public attDate: string;
  public tenant: WritableSignal<Tenant | undefined>;
  public tenants: WritableSignal<Tenant[] | undefined>;
  public tenantUsers: WritableSignal<TenantUser[] | undefined>;
  public tenantUser: WritableSignal<TenantUser | undefined>;

  constructor(
    private plt: Platform,
    private router: Router,
  ) {
    this.tenant = signal(undefined);
    this.tenants = signal([]);
    this.tenantUser = signal(undefined);
    this.tenantUsers = signal([]);
    this.plt.ready().then(() => {
      this.checkToken();
    });
  }

  getSupabase(): SupabaseClient {
    return supabase;
  }

  async checkToken() {
    if (this.tenantUser()) {
      return;
    }
    const { data } = await supabase.auth.getUser();

    if (data?.user?.email) {
      this.user = data.user;
      await this.setTenant();
    }
  }

  async setTenant() {
    this.tenantUsers.set((await this.getTenantsByUserId()));
    this.tenants.set(await this.getTenants(this.tenantUsers().map((tenantUser: TenantUser) => tenantUser.tenantId)));
    this.tenant.set(this.tenants()[0]);

    this.tenantUser.set(this.tenantUsers().find((tu: TenantUser) => tu.tenantId === this.tenant().id)); 
  }

  async getTenants(ids: number[]): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .in('id', ids);

    if (error) {
      throw new Error("Fehler beim Laden der Tenants");
    }

    return data;
  }

  async getTenantsByUserId(): Promise<TenantUser[]> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .eq('userId', this.user.id);

    if (error) {
      throw new Error("Fehler beim Laden der Mandanten");
    }

    return data;
  }

  async logout() {
    await supabase.auth.signOut();
    this.tenant.set(undefined);
    this.tenants.set([]);
    this.tenantUser.set(undefined);
    this.tenantUsers.set([]);

    this.router.navigateByUrl("/login");
  }

  async getViewers(): Promise<Viewer[]> {
    const { data, error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .select('*')
      .eq('tenantId', this.tenant().id);

    if (error) {
      Utils.showToast("Fehler beim Laden der Beobachter", "danger");
      throw error;
    }

    return data;
  }

  async createViewer(viewer: Partial<Viewer>) {
    const appId: string = await this.registerUser(viewer.email as string, viewer.firstName as string, Role.VIEWER);

    const { error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .insert({
        ...viewer,
        tenantId: this.tenant().id,
        appId
      });

    if (error) {
      throw new Error("Fehler beim hinzufügen des Beobachters.");
    }
  }

  async registerUser(email: string, name: string, role: Role): Promise<string> {
    const userId: string | undefined = await this.getAppIdByEmail(email);

    if (userId) {
      await this.addUserToTenant(userId, role, email);
      return userId;
    }

    try {
      const res = await axios.post(`https://staccato-server.vercel.app/api/registerAttendixUser`, {
        email,
        name,
      });

      if (!res.data?.user?.id) {
        throw new Error('Fehler beim Erstellen des Accounts');
      }

      await this.addUserToTenant(res.data.user.id, role, email);

      return res.data.user.id;
    } catch (e) {
      throw new Error(e.response.data?.error?.message || "Fehler beim Erstellen des Accounts");
    }
  }

  async addUserToTenant(userId: string, role: Role, email: string) {
    const { error } = await supabase
      .from('tenantUsers')
      .insert({
        userId,
        role,
        tenantId: this.tenant().id,
        email
      });

    if (error) {
      throw new Error('Fehler beim Hinzufügen des Benutzers zum Mandanten');
    }
  }

  async getAppIdByEmail(email: string): Promise<string | undefined> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .eq('email', email);

    if (data.find((tenantUser: TenantUser) => tenantUser.tenantId === this.tenant().id)) {
      throw new Error('Der Benutzer ist bereits in diesem Mandanten');
    }

    if (error) {
      throw new Error('Fehler beim Laden des Benutzers');
    }

    return data.length ? data[0].userId : undefined;
  }

  async createAccount(user: Player, table: SupabaseTable = SupabaseTable.PLAYER) {
    try {
      const appId: string = await this.registerUser(user.email as string, user.firstName, table === SupabaseTable.CONDUCTORS ? Role.CONDUCTOR : Role.PLAYER);

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
      await this.setTenant();
      this.router.navigateByUrl(Utils.getUrl(this.tenantUser().role));
    } else {
      Utils.showToast("Bitte gib die richtigen Daten an!", "danger");
    }

    return Boolean(data.user);
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
    return this.tenant().seasonStart || dayjs("2023-01-01").toISOString();
  }

  setCurrentAttDate(date: string) {
    this.attDate = date;
  }

  async getPlayerByAppId(showToast: boolean = true): Promise<Player> {
    const { data: player, error } = await supabase
      .from('player')
      .select('*')
      .eq('tenantId', this.tenant().id)
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
      .eq('tenantId', this.tenant().id)
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
        .select('*')
        .eq('tenantId', this.tenant().id);

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
      .eq('tenantId', this.tenant().id)
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
      isChoir: "TODO",
      shortName: "UNDEFINED", // TODO
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
      .eq('tenantId', this.tenant().id)
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
      .eq('tenantId', this.tenant().id)
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
      .eq('tenantId', this.tenant().id)
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
      .eq('tenantId', this.tenant().id)
      .order("lastName");

    return (all ? response.data : response.data.filter((c: Person) => !c.left)).map((con: Person) => { return { ...con, img: con.img || DEFAULT_IMAGE } });
  }

  async addConductor(person: Person, register: boolean): Promise<void> {
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
    delete dataToCreate.role;

    const { error, data } = await supabase
      .from('conductors')
      .insert({
        ...dataToCreate,
        tenantId: this.tenant().id,
      })
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim hinzufügen des Dirigenten.");
    }

    await this.addConductorToUpcomingAttendances(data.id);
    if (data.email && register) {
      await this.registerUser(data.email, data.firstName, Role.CONDUCTOR);
    }

    return;
  }

  async addPlayer(player: Player, register: boolean): Promise<void> {
    if (!this.tenant().maintainTeachers) {
      delete player.teacher;
    }

    const { data, error } = await supabase
      .from('player')
      .insert({
        ...player,
        tenantId: this.tenant().id,
        id: Utils.getId(),
        history: player.history as any
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await this.addPlayerToAttendancesByDate(data.id, data.joined);
    if (data.email && register) {
      await this.registerUser(data.email, data.firstName, Role.PLAYER);
    }
  }

  async addPlayerToAttendancesByDate(id: number, joined: string) {
    const attData: Attendance[] = await this.getAttendancesByDate(joined);

    if (attData?.length) {
      for (const att of attData) {
        att.players[id] = AttendanceStatus.Present;
        await this.updateAttendance({ players: att.players }, att.id);
      }
    }
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

  async removeConductorFromUpcomingAttendances(id: number) {
    const attData: Attendance[] = await this.getUpcomingAttendances();

    if (attData?.length) {
      for (const att of attData) {
        delete att.conductors[id];
        await this.updateAttendance({ conductors: att.conductors }, att.id as number);
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
      .eq('tenantId', this.tenant().id)
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
      .eq('tenantId', this.tenant().id)
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

  async updateConductor(person: Person, pausedAction?: boolean): Promise<Person[]> {
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

    if (pausedAction) {
      if (person.paused) {
        this.removeConductorFromUpcomingAttendances(person.id);
      } else {
        this.addConductorToUpcomingAttendances(person.id);
      }
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
      await this.removeEmailFromAuth(player.appId, player.email);
    }
  }

  async removeUserFromTenant(appId: string) {
    const { error } = await supabase
      .from('tenantUsers')
      .delete()
      .eq('tenantId', this.tenant().id)
      .match({ userId: appId });

    if (error) {
      throw new Error('Fehler beim Löschen des Accounts vom Mandanten');
    }
  }

  async removeEmailFromAuth(appId: string, email: string) {
    await this.removeUserFromTenant(appId);

    if (await this.getAppIdByEmail(email)) {
      return;
    }

    const res = await axios.post(`https://staccato-server.vercel.app/api/deleteUserFromAttendix`, {
      id: appId,
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
      await this.removeEmailFromAuth(conductor.appId, conductor.email);
    }
  }

  async archivePlayer(player: Player, left: string, notes: string): Promise<void> {
    if (player.appId && player.email) {
      await this.removeEmailFromAuth(player.appId, player.email);
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
      await this.removeEmailFromAuth(conductor.appId, conductor.email);
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
      .eq('tenantId', this.tenant().id)
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
        tenantId: this.tenant().id,
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
      .insert({
        ...attendance as any,
        tenantId: this.tenant().id,
      })
      .select();

    return data as any;
  }

  async getAttendance(all: boolean = false): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('tenantId', this.tenant().id)
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
      .eq('tenantId', this.tenant().id)
      .gt("date", dayjs().startOf("day").toISOString())
      .order("date", {
        ascending: false,
      });

    return data as any;
  }

  async getAttendancesByDate(date): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('tenantId', this.tenant().id)
      .gt("date", dayjs(date).startOf("day").toISOString())
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
      .eq('tenantId', this.tenant().id)
      .neq(`players->>"${id}"` as any, null)
      .gt("date", all ? dayjs("2020-01-01").toISOString() : await this.getCurrentAttDate())
      .order("date", {
        ascending: false,
      });

    return data.map((att): PersonAttendance => {
      let attText = Utils.getAttText(att as any, id);

      return {
        id: att.id,
        date: att.date,
        attended: attText === "L" || attText === "X",
        title: att.typeInfo ? att.typeInfo : att.type === "vortrag" ? "Vortrag" : "",
        text: attText,
        notes: att.playerNotes && att.playerNotes[id] ? att.playerNotes[id] : "",
        songs: att.songs,
      }
    });
  }

  async getConductorAttendance(id: number, all: boolean = false): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('tenantId', this.tenant().id)
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
      .eq('tenantId', this.tenant().id)
      .order("date", {
        ascending: false,
      });

    return data;
  }

  async addHistoryEntry(history: History[]): Promise<History[]> {
    const { data } = await supabase
      .from('history')
      .insert({
        ...history,
        tenantId: this.tenant().id,
      })
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
      .eq('tenantId', this.tenant().id)
      .order("name", {
        ascending: true,
      });

    return data;
  }

  async addTeacher(teacher: Teacher): Promise<Teacher[]> {
    const { data } = await supabase
      .from('teachers')
      .insert({
        ...teacher,
        tenantId: this.tenant().id
      })
      .select();

    return data;
  }

  async updateTeacher(teacher: Partial<Teacher>, id: number): Promise<Teacher[]> {
    delete teacher.insNames;
    delete teacher.playerCount;

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
      .eq('tenantId', this.tenant().id)
      .order("number", {
        ascending: true,
      });

    return response.data;
  }

  async addSong(song: Song): Promise<Song[]> {
    const { data } = await supabase
      .from('songs')
      .insert({
        ...song,
        tenantId: this.tenant().id,
      })
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
      .eq('tenantId', this.tenant().id)
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
      .insert({
        ...meeting,
        tenantId: this.tenant().id
      })
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

    // this.notifyPerTelegram(player, attendances, isLateExcused === true ? 'lateSignout' : "signout", reason); TODO

    loading.dismiss();
  }

  async signin(player: Player, attId: number): Promise<void> {
    const attendance: Attendance = await this.getAttendanceById(attId);
    attendance.players[player.id] = AttendanceStatus.Present;
    delete attendance.playerNotes[player.id];
    const playerIsLateExcused = attendance.lateExcused.includes(String(player.id));
    attendance.excused = attendance.excused.filter((playerId: string) => playerId !== String(player.id));
    attendance.lateExcused = attendance.lateExcused.filter((playerId: string) => playerId !== String(player.id));

    // this.notifyPerTelegram(player, [attendance], playerIsLateExcused === true ? 'lateSignin' : 'signin'); TODO

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
      shortName: "UNDEFINED", // TODO
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
      appName: 'UNDEFINED', // TODO
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
}
