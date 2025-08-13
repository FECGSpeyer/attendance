import { Injectable, WritableSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { createClient, SupabaseClient, SupabaseClientOptions, User } from '@supabase/supabase-js';
import axios from 'axios';
import * as dayjs from 'dayjs';
import { environment } from 'src/environments/environment';
import { AttendanceStatus, DEFAULT_IMAGE, PlayerHistoryType, Role, SupabaseTable } from '../utilities/constants';
import { Attendance, History, Instrument, Meeting, Person, Player, PlayerHistoryEntry, Song, Teacher, Tenant, TenantUser, Viewer, PersonAttendance, NotificationConfig } from '../utilities/interfaces';
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

const attendanceSelect: string = `*, persons:person_attendances(
          *, person:person_id(
            firstName, lastName, img, instrument(id, name), joined
          )
        )`;

@Injectable({
  providedIn: 'root'
})
export class DbService {
  private user: User;
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

  async setTenant(tenantId?: number) {
    this.tenantUsers.set((await this.getTenantsByUserId()));
    this.tenants.set(await this.getTenants(this.tenantUsers().map((tenantUser: TenantUser) => tenantUser.tenantId)));
    const storedTenantId: string | null = tenantId || this.user.user_metadata?.currentTenantId;
    if (storedTenantId && this.tenants().find((t: Tenant) => t.id === Number(storedTenantId))) {
      this.tenant.set(this.tenants().find((t: Tenant) => t.id === Number(storedTenantId)));
    } else {
      this.tenant.set(this.tenants()[0]);
    }

    if (this.user.user_metadata?.currentTenantId !== this.tenant().id) {
      this.user.user_metadata.currentTenantId = this.tenant().id;
      supabase.auth.updateUser({
        data: {
          currentTenantId: this.tenant().id,
        }
      });
    }

    const user = this.tenantUsers().find((tu: TenantUser) => tu.tenantId === this.tenant().id);
    const config = await this.getNotifcationConfig(user?.userId);
    this.tenantUser.set({
      ...user,
      telegram_chat_id: config?.telegram_chat_id,
    });
  }

  async getTenants(ids: number[]): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .in('id', ids)
      .order('longName', { ascending: true });

    if (error) {
      throw new Error("Fehler beim Laden der Tenants");
    }

    return data;
  }

  async updateTenantData(tenant: Partial<Tenant>): Promise<Tenant> {
    const { data, error } = await supabase
      .from('tenants')
      .update(tenant)
      .match({ id: this.tenant().id })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren der Einstellungen", "danger");
      throw new Error("Fehler beim Aktualisieren der Mandantendaten");
    }

    this.tenant.set(data);

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

  async getTenantUserById(id: string): Promise<TenantUser> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .match({ tenantId: this.tenant().id, userId: id })
      .single();

    if (error) {
      throw new Error("Fehler beim Laden des Mandanten");
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
    const { userId, alreadyThere } = await this.getAppIdByEmail(email) || {};

    if (userId) {
      if (alreadyThere) {
        return userId;
      }
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
      Utils.showToast("Fehler beim Hinzufügen des Benutzers zum Mandanten", "danger");
      throw new Error('Fehler beim Hinzufügen des Benutzers zum Mandanten');
    }
  }

  async updateTenantUser(updates: Partial<TenantUser>, userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .update(updates)
      .match({ tenantId: this.tenant().id, userId: userId });

    if (error) {
      throw new Error('Fehler beim Updaten des Benutzers');
    }

    return data;
  }

  async getAppIdByEmail(email: string): Promise<{ userId: string, alreadyThere: boolean } | undefined> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .ilike('email', `%${email}%`);

    const foundTenantUser = data.find((tenantUser: TenantUser) => tenantUser.tenantId === this.tenant().id);

    if (foundTenantUser && foundTenantUser.role !== Role.ADMIN) {
      throw new Error('Der Benutzer ist bereits in diesem Mandanten');
    }

    if (foundTenantUser?.role === Role.ADMIN) {
      return {
        userId: foundTenantUser.userId,
        alreadyThere: true,
      };
    }

    if (error) {
      throw new Error('Fehler beim Laden des Benutzers');
    }

    return data.length ? {
      userId: data[0].userId,
      alreadyThere: false,
    } : undefined;
  }

  async createAccount(user: Player) {
    try {
      const mainGroupId = (await this.getMainGroup())?.id;
      const role = (mainGroupId === user.instrument ? Role.RESPONSIBLE : Role.PLAYER);
      let appId: string;
      try {
        appId = await this.registerUser(user.email as string, user.firstName, role);
      } catch (error) {
        Utils.showToast(`${user.firstName} ${user.lastName} - Fehler beim Erstellen des Accounts: ${error.message}`, "danger");
        throw error;
      }
      const { data, error: updateError } = await supabase
        .from(SupabaseTable.PLAYER)
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

  async getRoleFromTenantUser(appId: string): Promise<Role> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('role')
      .eq('tenantId', this.tenant().id)
      .eq('userId', appId)
      .single();

    if (error) {
      throw new Error('Fehler beim Laden der Rolle');
    }

    return data?.role;
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
      .select('*, person_attendances(*)')
      .eq('tenantId', this.tenant().id)
      .is("left", null)
      .order("instrument")
      .order("isLeader", {
        ascending: false
      })
      .order("lastName");

    if (error) {
      Utils.showToast("Fehler beim Laden der Spieler", "danger");
      throw error;
    }

    return (data as any).map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    }) as any;
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

  async getConductors(all: boolean = false): Promise<Person[]> {
    const mainGroupId = (await this.getMainGroup())?.id;

    if (!mainGroupId) {
      throw new Error("Hauptgruppe nicht gefunden");
    }

    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('instrument', mainGroupId)
      .eq('tenantId', this.tenant().id)
      .order("lastName");

    if (error) {
      Utils.showToast("Fehler beim Laden der Hauptgruppen-Personen", "danger");
      throw new Error("Fehler beim Laden der Spieler");
    }

    return (all ? data : data.filter((c: Person) => !c.left)).map((con: Person) => { return { ...con, img: con.img || DEFAULT_IMAGE } });
  }

  async addPlayer(player: Player, register: boolean, role: Role): Promise<void> {
    if (!this.tenant().maintainTeachers) {
      delete player.teacher;
    }

    if (player.email && register && role) {
      const appId: string = await this.registerUser(player.email, player.firstName, role);
      player.appId = appId;
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
  }

  async addPlayerToAttendancesByDate(id: number, joined: string) {
    const attData: Attendance[] = await this.getAttendancesByDate(joined);

    if (attData?.length) {
      const attToAdd: PersonAttendance[] = await Promise.all(attData.map(async (att: Attendance) => {
        return {
          attendance_id: att.id,
          person_id: id,
          notes: "",
          status: AttendanceStatus.Present,
        }
      }));
      await this.addPersonAttendances(attToAdd);
    }
  }

  async addPlayerToUpcomingAttendances(id: number) {
    const attData: Attendance[] = await this.getUpcomingAttendances();

    if (attData?.length) {
      const attToAdd: PersonAttendance[] = attData.map((att: Attendance) => {
        return {
          attendance_id: att.id,
          person_id: id,
          notes: "",
          status: AttendanceStatus.Present,
        }
      });
      await this.addPersonAttendances(attToAdd);
    }
  }

  async removePlayerFromUpcomingAttendances(id: number) {
    const attData: Attendance[] = await this.getUpcomingAttendances();

    if (attData?.length) {
      await this.deletePersonAttendances(attData.map((att: Attendance) => att.id), id);
    }
  }

  async updatePlayer(player: Player, pausedAction?: boolean, createAccount?: boolean, role?: Role): Promise<Player[]> {
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
    delete dataToUpdate.person_attendances;
    delete dataToUpdate.percentage;

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

    if (createAccount && player.email && role) {
      const appId: string = await this.registerUser(player.email, player.firstName, role);
      player.appId = appId;
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

  async removePlayer(player: Person): Promise<void> {
    await supabase
      .from('player')
      .delete()
      .match({ id: player.id });

    if (player.appId) {
      await this.removeEmailFromAuth(player.appId, player.email);
    }
  }

  async removeUserFromTenant(appId: string) {
    const { data } = await supabase
      .from('tenantUsers')
      .select('*')
      .eq('role', Role.ADMIN)
      .eq('userId', appId)
      .eq('tenantId', this.tenant().id)
      .single();

    if (data) {
      return;
    }

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

  async getInstruments(): Promise<Instrument[]> {
    const { data } = await supabase
      .from('instruments')
      .select('*')
      .eq('tenantId', this.tenant().id)
      .order("maingroup", {
        ascending: false,
      })
      .order("name");

    return data;
  }

  async getMainGroup(): Promise<Instrument | undefined> {
    const { data } = await supabase
      .from('instruments')
      .select('*')
      .eq('tenantId', this.tenant().id)
      .eq('maingroup', true)
      .single();

    return data;
  }

  async addInstrument(name: string, maingroup: boolean = false, tenantId?: number): Promise<Instrument[]> {
    const { data } = await supabase
      .from('instruments')
      .insert({
        name,
        tuning: "C",
        clefs: ["g"],
        tenantId: tenantId || this.tenant().id,
        maingroup,
      })
      .select();

    return data;
  }

  async updateInstrument(att: Partial<Instrument>, id: number): Promise<Instrument[]> {
    const { data, error } = await supabase
      .from('instruments')
      .update(att)
      .match({ id })
      .select();

    if (error) {
      if (error.code === '23505') {
        Utils.showToast("Es kann nur eine Hauptgruppe existieren", "danger");
      } else {
        Utils.showToast("Fehler beim updaten des Instruments", "danger");
      }
      throw new Error("Fehler beim updaten des Instruments");
    }

    return data;
  }

  async removeInstrument(id: number): Promise<Instrument[]> {
    const { data } = await supabase
      .from('instruments')
      .delete()
      .match({ id });

    return data;
  }

  async addAttendance(attendance: Attendance): Promise<number> {
    const { data, error } = await supabase
      .from('attendance')
      .insert({
        ...attendance as any,
        tenantId: this.tenant().id,
      })
      .select().single();

    if (error) {
      throw new Error("Fehler beim hinzufügen der Anwesenheit");
    }

    return data.id;
  }

  async addPersonAttendances(personAttendances: PersonAttendance[]): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .insert(personAttendances);

    if (error) {
      throw new Error("");
    }

    return;
  }

  async deletePersonAttendances(ids: number[], personId: number): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .delete()
      .in('attendance_id', ids)
      .eq('person_id', personId);

    if (error) {
      throw new Error("");
    }

    return;
  }

  async getAttendance(all: boolean = false, withPersonAttendance: boolean = false): Promise<Attendance[]> {
    let res: any[];
    if (withPersonAttendance) {
      const { data } = await supabase
        .from('attendance')
        .select(`*, persons:person_attendances(
          *, person:person_id(
            firstName, lastName, img, instrument(id, name), joined
          )
        )`)
        .eq('tenantId', this.tenant().id)
        .gt("date", all ? dayjs("2020-01-01").toISOString() : await this.getCurrentAttDate())
        .order("date", {
          ascending: false,
        });

      res = data.map((att) => ({
        ...att,
        persons: att.persons.map((pa) => {
          return {
            ...pa,
            firstName: (pa as any).person.firstName,
            lastName: (pa as any).person.lastName,
            img: (pa as any).person.img,
            instrument: (pa as any).person.instrument.id,
            instrumentName: (pa as any).person.instrument.name,
            joined: (pa as any).person.joined,
          };
        })
      }) as any
      );
    } else {
      let { data } = await supabase
        .from('attendance')
        .select('*')
        .eq('tenantId', this.tenant().id)
        .gt("date", all ? dayjs("2020-01-01").toISOString() : await this.getCurrentAttDate())
        .order("date", {
          ascending: false,
        });

      res = data;
    }

    return res.map((att: any): Attendance => {
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
      .select(attendanceSelect)
      .match({ id })
      .order("date", {
        ascending: false,
      })
      .single();

    return Utils.getModifiedAttendanceData(data as any);
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

  async getPersonAttendances(id: number, all: boolean = false): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('person_attendances')
      .select('*, attendance:attendance_id(date, type, typeInfo, songs)')
      .eq('person_id', id)
      .gt("attendance.date", all ? dayjs("2020-01-01").toISOString() : await this.getCurrentAttDate());

    return data.filter((a) => Boolean(a.attendance)).map((att): PersonAttendance => {
      let attText = Utils.getAttText(att as any);

      return {
        id: att.id,
        date: (att.attendance as any).date,
        attended: attText === "L" || attText === "X",
        title: (att.attendance as any).typeInfo ? (att.attendance as any).typeInfo : (att.attendance as any).type === "vortrag" ? "Vortrag" : "",
        text: attText,
        notes: att.notes,
        songs: (att.attendance as any).songs,
      } as any;
    });
  }

  async updatePersonAttendance(id: string, att: Partial<PersonAttendance>): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .update(att)
      .match({ id });

    if (error) {
      throw new Error("Fehler beim updaten der Anwesenheit");
    }
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
      .insert(
        history.map((h: History) => {
          return {
            ...h,
            tenantId: this.tenant().id,
          }
        })
      )
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

  async updateSongsInHistory(songs: number[], date: string) {
    const { data } = await supabase
      .from('history')
      .select('*')
      .eq('tenantId', this.tenant().id);

    const filteredData = data.filter((h: History) => dayjs(h.date).isSame(dayjs(date), 'day'));
    const historyToInsert: History[] = [];

    for (const song of songs) {
      if (!filteredData.some((h: History) => h.songId === song)) {
        historyToInsert.push({
          songId: song,
          date: dayjs(date).toISOString(),
          tenantId: this.tenant().id,
          conductor: null,
          otherConductor: "Keine Angabe",
        });
      }
    }

    for (const h of filteredData) {
      if (!songs.includes(h.songId)) {
        await this.removeHistoryEntry(h.id);
      }
    }

    if (historyToInsert.length !== 0) {
      const { error } = await supabase
        .from('history')
        .insert(historyToInsert)
        .select();

      if (error) {
        throw new Error("Fehler beim Hinzufügen der Lieder zur Historie");
      }
    }

    return;
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

  async removeSong(id: number): Promise<void> {
    const { error } = await supabase
      .from('songs')
      .delete()
      .match({ id });

    if (error) {
      throw new Error("Fehler beim Löschen des Liedes");
    }

    return;
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

  async signout(attIds: string[], reason: string, isLateExcused: Boolean): Promise<void> {
    for (const attId of attIds) {
      await this.updatePersonAttendance(attId, {
        notes: reason,
        status: isLateExcused ? AttendanceStatus.LateExcused : AttendanceStatus.Excused,
      });
    }

    this.notifyPerTelegram(attIds[0], isLateExcused === true ? 'lateSignout' : "signout", reason);

    return;
  }

  async signin(attId: string, status: string): Promise<void> {
    await this.updatePersonAttendance(attId, {
      notes: "",
      status: AttendanceStatus.Present,
    });

    this.notifyPerTelegram(attId, status);

    return;
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

    const { data: urlData } = await supabase
      .storage
      .from("attendances")
      .getPublicUrl(fileName);

    const { error: sendError } = await supabase.functions.invoke("send-document", {
      body: {
        url: urlData.publicUrl,
        chat_id: this.tenantUser().telegram_chat_id,
      },
      method: "POST",
    });

    loading.dismiss();

    if (!sendError) {
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

  async notifyPerTelegram(attId: string, type: string = "signin", reason?: string): Promise<void> {
    await supabase.functions.invoke("quick-processor", {
      body: {
        attId,
        type,
        reason,
      },
      method: "POST",
    });
  }

  async removeImage(id: number, imgPath: string) {
    await supabase
      .from("player")
      .update({ img: "" })
      .match({ id });

    await supabase.storage
      .from("profiles")
      .remove([String(id)]);
  }

  async updateImage(id: number, image: File) {
    const fileName: string = `${id}`;

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

    await supabase
      .from("player")
      .update({ img: data.publicUrl })
      .match({ id });

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

  async getNotifcationConfig(userId: string) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', userId)
      .single();

    if (!data) {
      const newData = {
        id: userId,
        created_at: new Date().toISOString(),
        enabled: false,
        telegram_chat_id: "",
        birthdays: true,
        signins: true,
        signouts: true,
      };

      await supabase
        .from('notifications')
        .insert(newData);

      return newData;
    }

    return data;
  }

  async updateNotificationConfig(config: NotificationConfig) {
    const { error } = await supabase
      .from("notifications")
      .update(config)
      .eq("id", config.id);

    if (error) {
      Utils.showToast("Fehler beim Updaten der Konfiguration, bitte versuche es später erneut.", "danger")
      throw new Error(error.message);
    }

    return;
  }

  async createInstance(tenant: Tenant, mainGroupName: string): Promise<void> {
    const { data, error } = await supabase
      .from("tenants")
      .insert(tenant)
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Erstellen der Instanz, bitte versuche es später erneut.", "danger");
      throw new Error(error.message);
    }

    const usersToAdd = [{
        userId: "665fe2b4-d53f-4f17-a66b-46c0949af99a",
        role: Role.ADMIN,
        tenantId: data.id,
        email: "developer@attendix.de"
      }];

    if (this.user.email !== "developer@attendix.de") {
      usersToAdd.push({
        userId: this.user.id,
        role: Role.ADMIN,
        tenantId: data.id,
        email: this.user.email,
      });
    }

    const { error: userError } = await supabase
      .from("tenantUsers")
      .insert(usersToAdd);

    if (userError) {
      Utils.showToast("Fehler beim Erstellen des Benutzers, bitte versuche es später erneut.", "danger");
      throw new Error(userError.message);
    }

    await this.addInstrument(mainGroupName, true, data.id);

    Utils.showToast("Instanz wurde erfolgreich erstellt!");

    await this.setTenant(data.id);
    this.router.navigateByUrl(Utils.getUrl(Role.ADMIN));
  }

  async getPossiblePersonsByName(firstName: string, lastName: string): Promise<Person[]> {
    const { data, error } = await supabase
      .from('player')
      .select('*, instrument(name), tenantId(id, shortName)')
      .ilike('firstName', `%${firstName.trim()}%`)
      .ilike('lastName', `%${lastName.trim()}%`)
      .neq('email', null);

    const { data: tenantGroupTenants, error: tenantGroupTenantsError } = await supabase
      .from('tenant_group_tenants')
      .select('*');

    if (tenantGroupTenantsError) {
      Utils.showToast("Fehler beim Laden der Gruppenteilnehmer", "danger");
      throw tenantGroupTenantsError;
    }

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    const groups = tenantGroupTenants.filter((tgt) => tgt.tenant_id === this.tenant().id);
    const linkedTenants = tenantGroupTenants.filter((tgt) =>
      groups.some((g) => g.tenant_group === tgt.tenant_group) && tgt.tenant_id !== this.tenant().id
    ).map((tgt) => tgt.tenant_id);

    return data.filter((p: Person) => {
      return linkedTenants.includes((p as any).tenantId.id);
    });
  }
}
