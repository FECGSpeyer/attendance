import { Injectable, WritableSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { createClient, SupabaseClient, SupabaseClientOptions, User } from '@supabase/supabase-js';
import axios from 'axios';
import * as dayjs from 'dayjs';
import { environment } from 'src/environments/environment';
import { AttendanceStatus, DEFAULT_IMAGE, PlayerHistoryType, Role, SupabaseTable } from '../utilities/constants';
import { Attendance, History, Group, Meeting, Person, Player, PlayerHistoryEntry, Song, Teacher, Tenant, TenantUser, Viewer, PersonAttendance, NotificationConfig, Parent, Admin, Organisation, AttendanceType, ShiftPlan, ShiftDefinition } from '../utilities/interfaces';
import { SongFile } from '../utilities/interfaces';
import { Database } from '../utilities/supabase';
import { Utils } from '../utilities/Utils';
import { Holiday } from 'open-holiday-js';

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
  public user: User;
  public attDate: string;
  public tenant: WritableSignal<Tenant | undefined>;
  public organisation: WritableSignal<Organisation | null>;
  public tenants: WritableSignal<Tenant[] | undefined>;
  public tenantUsers: WritableSignal<TenantUser[] | undefined>;
  public tenantUser: WritableSignal<TenantUser | undefined>;
  public attendanceTypes: WritableSignal<AttendanceType[]>;
  public groups: WritableSignal<Group[]>;
  public shifts: WritableSignal<ShiftPlan[]>;

  constructor(
    private plt: Platform,
    private router: Router,
  ) {
    this.tenant = signal(undefined);
    this.tenants = signal([]);
    this.tenantUser = signal(undefined);
    this.attendanceTypes = signal([]);
    this.organisation = signal(null);
    this.tenantUsers = signal([]);
    this.groups = signal([]);
    this.shifts = signal([]);
    this.plt.ready().then(() => {
      this.checkToken();
    });
  }

  getSupabase(): SupabaseClient {
    return supabase;
  }

  encodeFilename(filename: string) {
    const nameParts = filename.split('.')
    const ext = nameParts.pop() || ''
    const name = nameParts.join('.')

    const sanitizedName = name
      .normalize('NFD') // Normalize unicode (convert accents to ASCII equivalents where possible)
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (e.g. é -> e)
      .replace(/[^\w\s-]/g, '-') // Replace non-word chars with hyphens (e.g. # -> -)
      .replace(/\s+/g, '-') // Replace spaces with hyphens (e.g. "hello world" -> "hello-world")
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen (e.g. "hello--world" -> "hello-world")
      .replace(/^-+|-+$/g, '') // Trim hyphens from start and end (e.g. "-hello-world-" -> "hello-world")
    // number between 100 and 999
    const randomNumber = Math.floor(100 + Math.random() * 900);
    return `${sanitizedName}_${randomNumber}.${ext}`;
  }

  async uploadSongFile(songId: number, file: File, instrumentId: number | null, note?: string): Promise<SongFile> {
    const tenantId = this.tenant().id;
    // Generate a unique fileId (timestamp + random)
    const fileId = this.encodeFilename(file.name);
    const filePath = `songs/${tenantId}/${songId}/${fileId}`;
    const fileName = file.name;
    // Upload to Supabase storage
    const { error } = await supabase.storage
      .from('songs')
      .upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    // Get public URL
    const { data } = await supabase.storage
      .from('songs')
      .getPublicUrl(filePath);
    // Create SongFile object
    const songFile: SongFile = {
      storageName: fileId,
      fileName,
      fileType: file.type,
      url: data.publicUrl,
      instrumentId,
      note,
      created_at: new Date().toISOString(),
    };
    // Update the song.files array
    const song = await this.getSong(songId);
    const files = song.files ? [...song.files, songFile] : [songFile];
    const filesJson = files.map(f => ({
      storageName: f.storageName,
      fileName: f.fileName,
      fileType: f.fileType,
      url: f.url,
      instrumentId: f.instrumentId ?? null,
      note: f.note,
    }));
    const mainGroupId = this.getMainGroup()?.id;
    await supabase
      .from('songs')
      .update({
        files: filesJson,
        instrument_ids: Array.from(new Set((filesJson || []).map(f => f.instrumentId).filter(id => id !== null && id !== 1 && id !== mainGroupId)))
      })
      .match({ id: songId });
    return songFile;
  }

  async downloadSongFile(fileName: string, songId: number): Promise<Blob> {
    const tenantId = this.tenant().id;
    const filePath = `songs/${tenantId}/${songId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('songs')
      .download(filePath);

    if (error) throw new Error(error.message);

    return data;
  }

  async deleteSongFile(songId: number, file: SongFile): Promise<SongFile> {
    const song = await this.getSong(songId);
    const files = song.files ? song.files.filter(f => f.url !== file.url) : [];
    const filesJson = files.map(f => ({
      fileName: f.fileName,
      fileType: f.fileType,
      url: f.url,
      instrumentId: f.instrumentId ?? null,
      note: f.note,
    }));

    const filePath = `${this.tenant().id}/${songId}/${file.fileName}`;
    const { error } = await supabase.storage
      .from('songs')
      .remove([filePath]);

    if (error) throw new Error(error.message);

    await supabase
      .from('songs')
      .update({
        files: filesJson,
        instrument_ids: Array.from(new Set((filesJson || []).map(f => f.instrumentId).filter(id => id !== null && id !== 1 && id !== this.getMainGroup()?.id)))
      })
      .match({ id: songId });
    return file;
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

    if (this.tenantUsers().length === 0) {
      this.tenants.set([]);
      this.tenantUser.set(undefined);
      this.tenant.set(undefined);
      return;
    }

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
    this.groups.set(await this.getGroups());
    this.attendanceTypes.set(await this.getAttendanceTypes());
    this.organisation.set(await this.getOrganisationFromTenant());

    await this.loadShifts();
  }

  isBeta() {
    return this.tenantUser()?.email?.endsWith("@attendix.de");
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

    return data as unknown as Tenant[];
  }

  async updateTenantData(tenant: Partial<Tenant>): Promise<Tenant> {
    const { data, error } = await supabase
      .from('tenants')
      .update(tenant as any)
      .match({ id: this.tenant().id })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren der Einstellungen", "danger");
      throw new Error("Fehler beim Aktualisieren der Mandantendaten");
    }

    this.tenant.set(data as unknown as Tenant);

    return data as unknown as Tenant;
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

  async deleteViewer(viewer: Viewer): Promise<void> {
    try {
      await this.removeEmailFromAuth(viewer.appId, viewer.email);
    } catch (error) {
      Utils.showToast("Fehler beim Entfernen der E-Mail aus der Authentifizierung", "danger");
      throw error;
    }

    const { error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .delete()
      .match({ id: viewer.id });

    if (error) {
      Utils.showToast("Fehler beim Löschen des Beobachters", "danger");
      throw error;
    }
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

  async deleteParent(parent: Parent): Promise<void> {
    try {
      await this.removeEmailFromAuth(parent.appId, parent.email);
    } catch (error) {
      Utils.showToast("Fehler beim Entfernen der E-Mail aus der Authentifizierung", "danger");
      throw error;
    }

    const { error } = await supabase
      .from("parents")
      .delete()
      .match({ id: parent.id });

    if (error) {
      Utils.showToast("Fehler beim Löschen des Elternteils", "danger");
      throw error;
    }
  }

  async getParents(): Promise<Parent[]> {
    const { data, error } = await supabase
      .from("parents")
      .select('*')
      .eq('tenantId', this.tenant().id);

    if (error) {
      Utils.showToast("Fehler beim Laden der Elternteile", "danger");
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

  async createParent(parent: Partial<Parent>) {
    const appId: string = await this.registerUser(parent.email as string, parent.firstName as string, Role.PARENT);

    const { error, data } = await supabase
      .from("parents")
      .insert({
        ...parent,
        tenantId: this.tenant().id,
        appId
      })
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim hinzufügen des Elternteils.");
    }

    await this.updateTenantUser({
      parent_id: data.id
    }, appId);
  }

  async registerUser(email: string, name: string, role: Role, tenantId?: number): Promise<string> {
    const { userId, alreadyThere } = await this.getAppIdByEmail(email, tenantId || this.tenant().id) || {};

    if (userId) {
      if (alreadyThere) {
        return userId;
      }
      await this.addUserToTenant(userId, role, email, tenantId);
      const res = await axios.post(`https://staccato-server.vercel.app/api/informAttendixUser`, {
        email,
        name,
        role: Utils.getRoleText(role),
        tenant: this.tenant().longName,
      });

      if (!res.data.mailSent) {
        throw new Error('Fehler beim Informieren des Benutzers');
      }

      return userId;
    } else {
      const { data } = await supabase.rpc(
        "get_user_id_by_email",
        {
          email: email.toLowerCase(),
        }
      );

      if (data?.length && data[0].id) {
        return data[0].id;
      }
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

  async addUserToTenant(userId: string, role: Role, email: string, tenantId?: number) {
    const { error } = await supabase
      .from('tenantUsers')
      .insert({
        userId,
        role,
        tenantId: tenantId ?? this.tenant().id,
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

  async getAppIdByEmail(email: string, tenantId: number): Promise<{ userId: string, alreadyThere: boolean } | undefined> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .ilike('email', `%${email}%`);

    const foundTenantUser = data.find((tenantUser: TenantUser) => tenantUser.tenantId === tenantId);

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
      const mainGroupId = this.getMainGroup()?.id;
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email, password,
    });

    if (error) {
      Utils.showToast(error.code === "email_not_confirmed" ? "Bitte bestätige zuerst deine E-Mail-Adresse." : "Fehler beim Anmelden", "danger");
      throw error;
    }

    if (data.user) {
      this.user = data.user;
      await this.setTenant();
      if (this.tenantUser()) {
        this.router.navigateByUrl(Utils.getUrl(this.tenantUser().role));
      } else {
        this.router.navigateByUrl("/register");
      }
    } else {
      Utils.showToast("Bitte gib die richtigen Daten an!", "danger");
    }

    return Boolean(data.user);
  }

  async register(email: string, password: string): Promise<boolean> {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `https://attendix.de/login`,
      }
    });

    if (error) {
      Utils.showToast("Fehler beim Registrieren", "danger");
      return false;
    }

    return true;
  }

  async getPlayerProfile(): Promise<Player | undefined> {
    try {
      const player: Player = await this.getPlayerByAppId(false);
      return player;
    } catch (_) {
      return undefined;
    }
  }

  getCurrentAttDate() {
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
    } as any
  }

  async getPlayers(all: boolean = false): Promise<Player[]> {
    if (all) {
      const { data, error } = await supabase
        .from('player')
        .select('*')
        .eq('tenantId', this.tenant().id);

      if (error) {
        Utils.showToast("Fehler beim Laden der Personen", "danger");
        throw error;
      }

      return data.map((player) => {
        return {
          ...player,
          history: player.history as any,
        }
      }) as any;
    }

    if (this.tenantUser().role === Role.PARENT) {
      const { data, error } = await supabase
        .from('player')
        .select('*, person_attendances(*)')
        .eq('tenantId', this.tenant().id)
        .eq('parent_id', this.tenantUser().parent_id)
        .is("left", null)
        .order("instrument")
        .order("isLeader", {
          ascending: false
        })
        .order("lastName");

      if (error) {
        Utils.showToast("Fehler beim Laden der Kinder");
        throw error;
      }

      return (data as any).map((player) => {
        return {
          ...player,
          history: player.history.filter((his: PlayerHistoryEntry) => [PlayerHistoryType.PAUSED, PlayerHistoryType.UNPAUSED, PlayerHistoryType.INSTRUMENT_CHANGE].includes(his.type)) as any,
        }
      }) as any;
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
      Utils.showToast("Fehler beim Laden der Personen", "danger");
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

    return data.map((player: any) => {
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

    return data.map((player: any) => {
      return {
        ...player,
        history: player.history as any,
      }
    }).filter((p: any) => p.email.length);
  }

  async getConductors(all: boolean = false, tenantId?: number, mainGroupId?: number): Promise<Person[]> {
    const mainGroupIdLocal = mainGroupId ?? this.getMainGroup()?.id;

    if (!mainGroupIdLocal) {
      throw new Error("Hauptgruppe nicht gefunden");
    }

    const { data, error } = await supabase
      .from('player')
      .select('*')
      .eq('instrument', mainGroupIdLocal)
      .eq('tenantId', tenantId ?? this.tenant().id)
      .order("lastName");

    if (error) {
      Utils.showToast("Fehler beim Laden der Hauptgruppen-Personen", "danger");
      throw new Error("Fehler beim Laden der Personen");
    }

    return (all ? data : data.filter((c: any) => !c.left) as unknown as Person[]).map((con: any) => { return { ...con, img: con.img || DEFAULT_IMAGE } });
  }

  async addPlayer(player: Player, register: boolean, role: Role, tenantId?: number): Promise<void> {
    if (!this.tenant().maintainTeachers) {
      delete player.teacher;
    }

    if (player.email && register && role) {
      const appId: string = await this.registerUser(player.email, player.firstName, role, tenantId);
      player.appId = appId;
    }

    const { data, error } = await supabase
      .from('player')
      .insert({
        ...player,
        tenantId: tenantId ?? this.tenant().id,
        id: Utils.getId(),
        history: player.history as any
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await this.addPlayerToAttendancesByDate(data.id, data.joined, tenantId);
  }

  async addPlayerToAttendancesByDate(id: number, joined: string, tenantId?: number) {
    const attData: Attendance[] = await this.getAttendancesByDate(joined, tenantId);

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

  async addPlayerToUpcomingAttendances(id: number, group: number) {
    const attData: Attendance[] = await this.getUpcomingAttendances();

    if (attData?.length) {
      const attToAdd: PersonAttendance[] = attData
        .filter((att: Attendance) => {
          const attType = this.attendanceTypes().find((type: AttendanceType) => type.id === att.type_id);
          return attType.relevant_groups.length === 0 || attType.relevant_groups.includes(group);
        })
        .map((att: Attendance) => {
          let status = AttendanceStatus.Present;

          const attType = this.attendanceTypes().find((type: AttendanceType) => type.id === att.type_id);
          status = attType?.default_status;

          return {
            attendance_id: att.id,
            person_id: id,
            notes: "",
            status,
          }
        });
      await this.addPersonAttendances(attToAdd);
    }
  }

  async removePlayerFromUpcomingAttendances(id: number, left?: string) {
    const attData: Attendance[] = left ? await this.getAttendancesByDate(left) : await this.getUpcomingAttendances();

    if (attData?.length) {
      await this.deletePersonAttendances(attData.map((att: Attendance) => att.id), id);
    }
  }

  async updatePlayer(player: Player, pausedAction?: boolean, createAccount?: boolean, role?: Role): Promise<Player[]> {
    const dataToUpdate: Player = { ...player };
    delete dataToUpdate.id;
    delete dataToUpdate.created_at;
    delete dataToUpdate.groupName;
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

    if (createAccount && player.email && role) {
      const appId: string = await this.registerUser(player.email, player.firstName, role);
      dataToUpdate.appId = appId;
    }

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
        this.addPlayerToUpcomingAttendances(player.id, player.instrument);
      }
    }

    return data.map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    }) as unknown as Player[];
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

  async removeUserFromTenant(appId: string, deleteAdmin: boolean = false): Promise<void> {
    if (deleteAdmin) {
      const { error } = await supabase
        .from('tenantUsers')
        .delete()
        .eq('tenantId', this.tenant().id)
        .eq('role', Role.ADMIN)
        .match({ userId: appId });

      if (error) {
        throw new Error('Fehler beim Löschen des Accounts vom Mandanten');
      }
      return;
    }

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

  async removeEmailFromAuth(appId: string, email: string, deleteAdmin: boolean = false): Promise<void> {
    await this.removeUserFromTenant(appId, deleteAdmin);

    if (await this.getAppIdByEmail(email, this.tenant().id)) {
      return;
    }

    // const res = await axios.post(`https://staccato-server.vercel.app/api/deleteUserFromAttendix`, {
    //   id: appId,
    // });

    // if (res.status !== 200) {
    //   throw new Error('Fehler beim Löschen des Accounts');
    // }
  }

  async archivePlayer(player: Player, left: string, notes: string): Promise<void> {
    if (player.appId && player.email) {
      await this.removeEmailFromAuth(player.appId, player.email);
      delete player.appId;
    }

    player.history.push({
      date: new Date().toISOString(),
      text: notes || "Kein Grund angegeben",
      type: PlayerHistoryType.ARCHIVED,
    });

    await supabase
      .from('player')
      .update({ left, history: player.history as any })
      .match({ id: player.id });

    await this.removePlayerFromUpcomingAttendances(player.id, left);
  }

  async getGroups(tenantId?: number): Promise<Group[]> {
    const { data } = await supabase
      .from('instruments')
      .select('*, categoryData:category(*)')
      .eq('tenantId', tenantId ?? this.tenant().id)
      .order("category")
      .order("name", { ascending: true });

    return data as any;
  }

  getMainGroup(): Group | undefined {
    return this.groups().find((inst: Group) => { return inst.maingroup; });
  }

  async addGroup(name: string, maingroup: boolean = false, tenantId?: number): Promise<Group[]> {
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

    if (this.tenant().id) {
      this.groups.set(await this.getGroups());
    }

    return data;
  }

  async updateGroup(att: Partial<Group>, id: number): Promise<Group[]> {
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

    this.groups.set(await this.getGroups());

    return data;
  }

  async removeGroup(id: number): Promise<Group[]> {
    const { data } = await supabase
      .from('instruments')
      .delete()
      .match({ id })
      .select();

    this.groups.set(await this.getGroups());

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
        .gt("date", all ? dayjs("2020-01-01").toISOString() : this.getCurrentAttDate())
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
            groupName: (pa as any).person.instrument.name,
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
        .gt("date", all ? dayjs("2020-01-01").toISOString() : this.getCurrentAttDate())
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

  async getAttendancesByDate(date, tenantId?: number): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('tenantId', tenantId || this.tenant().id)
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

  async updateAttendance(att: Partial<Attendance>, id: number): Promise<Attendance> {
    const { data, error } = await supabase
      .from('attendance')
      .update(att as any)
      .match({ id })
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim updaten der Anwesenheit");
    }

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
      .select('*, attendance:attendance_id(id, date, type, typeInfo, songs, type_id)')
      .eq('person_id', id)
      .gt("attendance.date", all ? dayjs("2020-01-01").toISOString() : this.getCurrentAttDate());

    return data.filter((a) => Boolean(a.attendance)).map((att): PersonAttendance => {
      let attText = Utils.getAttText(att);
      const attType = this.attendanceTypes().find((type: AttendanceType) => type.id === att.attendance.type_id);
      let title = '';

      if (attType) {
        title = Utils.getTypeTitle(attType, att.attendance.typeInfo);
      }

      return {
        id: att.id,
        status: att.status,
        date: att.attendance.date,
        attended: att.status === AttendanceStatus.Present || att.status === AttendanceStatus.Late || att.status === AttendanceStatus.LateExcused,
        title,
        text: attText,
        notes: att.notes,
        songs: att.attendance.songs,
        attId: att.attendance.id,
        typeId: att.attendance.type_id,
        highlight: attType ? attType.highlight : att.attendance.type === "vortrag",
      } as any;
    });
  }

  async getParentAttendances(player: Person[], attendances: Attendance[]): Promise<any[]> {
    const { data, error } = await supabase
      .from('person_attendances')
      .select('*, person:person_id(firstName)')
      .in('person_id', player.map(p => p.id))
      .in('attendance_id', attendances.map(a => a.id));

    if (error) {
      Utils.showToast("Fehler beim Laden der Anwesenheiten", "danger");
      throw error;
    }

    if (!data || !data.length) {
      return [];
    }

    return data;
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

  async getHistory(tenantId?: number): Promise<History[]> {
    const { data } = await supabase
      .from('history')
      .select('*, attendance:attendance_id(date)')
      .eq('tenantId', tenantId ?? this.tenant().id)
      .eq('visible', true)
      .order("date", {
        ascending: false,
      });

    return data as any;
  }

  async getHistoryByAttendanceId(attendance_id: number): Promise<History[]> {
    const { data } = await supabase
      .from('history')
      .select('*')
      .eq('tenantId', this.tenant().id)
      .eq('attendance_id', attendance_id)
      .order("songId", {
        ascending: true,
      });

    return data;
  }

  async updateHistoryEntry(id: number, history: Partial<History>): Promise<History[]> {
    const { data, error } = await supabase
      .from('history')
      .update(history)
      .match({ id });

    if (error) {
      Utils.showToast("Fehler beim Updaten des Eintrags", "danger");
      throw new Error("Fehler beim Updaten des Eintrags");
    }

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

  async addSongsToHistory(historyEntries: History[]) {
    const { error } = await supabase
      .from('history')
      .insert(historyEntries)
      .select();

    if (error) {
      throw new Error("Fehler beim Hinzufügen der Lieder zur Historie");
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

  async getSongs(tenantId?: number): Promise<Song[]> {
    const response = await supabase
      .from('songs')
      .select('*')
      .eq('tenantId', tenantId ?? this.tenant().id)
      .order("number", {
        ascending: true,
      });

    return response.data as any;
  }

  async getSong(id: number, tenantId?: number): Promise<Song> {
    const response = await supabase
      .from('songs')
      .select('*')
      .match({ id })
      .match({ tenantId: tenantId ?? this.tenant().id })
      .single();

    return {
      ...response.data,
      files: response.data.files.sort((a, b) => ((a as any).instrumentId || 0) - ((b as any).instrumentId || 0)),
    } as any;
  }

  async addSong(song: Song): Promise<Song> {
    const { data } = await supabase
      .from('songs')
      .insert({
        ...song,
        tenantId: this.tenant().id,
      } as any)
      .select()
      .single();

    return data as unknown as Song;
  }

  async removeSong(song: Song): Promise<void> {
    if (song.files && song.files.length) {
      const paths: string[] = song.files.map((file) => {
        return `${this.tenant().id}/${song.id}/${file.fileName}`;
      });

      await supabase.storage
        .from('songs')
        .remove(paths);
    }

    const { error } = await supabase
      .from('songs')
      .delete()
      .match({ id: song.id });

    if (error) {
      throw new Error("Fehler beim Löschen des Werks");
    }

    return;
  }

  async editSong(id: number, song: Song): Promise<Song[]> {
    const { data } = await supabase
      .from('songs')
      .update(song as any)
      .match({ id });

    return data as any;
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
      .match({ tenantId: this.tenant().id })
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

  async signout(attIds: string[], reason: string, isLateExcused: boolean, isParents: boolean = false): Promise<void> {
    for (const attId of attIds) {
      await this.updatePersonAttendance(attId, {
        notes: reason,
        status: isLateExcused ? AttendanceStatus.LateExcused : AttendanceStatus.Excused,
      });
    }

    this.notifyPerTelegram(attIds[0], isLateExcused === true ? 'lateSignout' : "signout", reason, isParents);

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
    const fileName: string = name + "_" + Math.floor(Math.random() * 100);

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

  async sendSongPerTelegram(url: string): Promise<void> {
    const { error: sendError } = await supabase.functions.invoke("send-document", {
      body: {
        url: url,
        sendAsUrl: url.includes(".sib"),
        chat_id: this.tenantUser().telegram_chat_id,
      },
      method: "POST",
    });

    if (!sendError) {
      Utils.showToast("Nachricht wurde erfolgreich gesendet!");
    } else {
      Utils.showToast("Fehler beim Senden der Nachricht, versuche es später erneut!", "danger");
    }
  }

  async notifyPerTelegram(attId: string, type: string = "signin", reason?: string, isParents: boolean = false): Promise<void> {
    await supabase.functions.invoke("quick-processor", {
      body: {
        attId,
        type,
        reason,
        isParents
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

  async getCurrentSongs(tenantId?: number): Promise<{ date: string; history: History[] }[]> {
    const { data, error } = await supabase
      .from("history")
      .select(`
        id,
        person_id (
          firstName, lastName
        ),
        date,
        otherConductor,
        song:songId (*),
        attendance_id (
          date
        )
      `)
      .eq("tenantId", tenantId ?? this.tenant().id)
      .gt("date", dayjs().startOf("day").toISOString());

    if (error) {
      throw new Error(error.message);
    }

    const groupedData: { [key: string]: History[] } = {};

    data.forEach((his: any) => {
      const date = his.attendance_id ? dayjs(his.attendance_id.date).format("DD.MM.YYYY") : dayjs(his.date).format("DD.MM.YYYY");
      if (!groupedData[date]) {
        groupedData[date] = [];
      }
      groupedData[date].push({
        ...his,
        conductorName: his.person_id ? `${his.person_id.firstName} ${his.person_id.lastName}` : his.otherConductor || "",
      });
    });

    // sort by date descending
    const sortedDates = Object.keys(groupedData).sort((a, b) => dayjs(b, "DD.MM.YYYY").diff(dayjs(a, "DD.MM.YYYY"))).reverse();

    return sortedDates.map(date => ({
      date,
      history: groupedData[date],
    }));
  }


  async getUpcomingHistory(): Promise<History[]> {
    const { data, error } = await (supabase as any)
      .from("history")
      .select(`
        id,
        person_id (
          firstName, lastName
        ),
        date,
        otherConductor,
        songId,
        attendance_id (
          date
        )
      `)
      .eq("tenantId", this.tenant().id);

    if (error) {
      throw new Error(error.message);
    }

    return data.map((his: any) => {
      return {
        ...his,
        conductorName: his.person_id ? `${his.person_id.firstName} ${his.person_id.lastName}` : his.otherConductor || "",
      };
    }).filter((h: any) => {
      const date = h.attendance_id ? dayjs(h.attendance_id.date) : dayjs(h.date);
      return date.isAfter(dayjs().startOf("day"));
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
        updates: true,
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

  async deleteInstance(tenantId: number): Promise<void> {
    const { error } = await supabase
      .from("tenants")
      .delete()
      .match({ id: tenantId });

    if (error) {
      Utils.showToast("Fehler beim Löschen der Instanz, bitte versuche es später erneut.", "danger");
      throw new Error(error.message);
    }

    await this.setTenant();

    if (this.tenantUser()) {
      this.router.navigateByUrl(Utils.getUrl(this.tenantUser().role));
    } else {
      this.router.navigateByUrl("/register");
    }

    Utils.showToast("Instanz wurde erfolgreich gelöscht!");
  }

  async createInstance(tenant: Tenant, mainGroupName: string): Promise<void> {
    const { data, error } = await supabase
      .from("tenants")
      .insert(tenant as any)
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

    await this.addGroup(mainGroupName, true, data.id);

    Utils.showToast("Instanz wurde erfolgreich erstellt!");

    await this.setTenant(data.id);
    this.router.navigateByUrl(Utils.getUrl(Role.ADMIN));
  }

  async getPossiblePersonsByName(firstName: string, lastName: string, onlyWithAccount: boolean = true): Promise<Person[]> {
    let data;
    let error;
    if (onlyWithAccount) {
      const res = await supabase
        .from('player')
        .select('*, instrument(name), tenantId(id, shortName, longName)')
        .ilike('firstName', `%${firstName.trim()}%`)
        .ilike('lastName', `%${lastName.trim()}%`)
        .neq('email', null);

      data = res.data;
      error = res.error;
    } else {
      const res = await supabase
        .from('player')
        .select('*, instrument(name), tenantId(id, shortName, longName)')
        .ilike('firstName', `%${firstName.trim()}%`)
        .ilike('lastName', `%${lastName.trim()}%`);

      data = res.data;
      error = res.error;
    }

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    const linkedTenants = await this.getLinkedTenants();

    return data.filter((p: Person) => {
      return linkedTenants.find((lt) => lt.id === (p as any).tenantId.id);
    });
  }

  async getLinkedTenants(): Promise<Tenant[]> {
    const { data: tenantGroupTenants, error: tenantGroupTenantsError } = await supabase
      .from('tenant_group_tenants')
      .select('*, tenant:tenant_id(*)');

    if (tenantGroupTenantsError) {
      Utils.showToast("Fehler beim Laden der Gruppenteilnehmer", "danger");
      throw tenantGroupTenantsError;
    }

    const groups = tenantGroupTenants.filter((tgt) => tgt.tenant_id === this.tenant().id);
    return tenantGroupTenants.filter((tgt) =>
      groups.some((g) => g.tenant_group === tgt.tenant_group) && tgt.tenant_id !== this.tenant().id
    ).map((tgt) => tgt.tenant) as unknown as Tenant[];
  }

  async getUserRolesForTenants(userId: string): Promise<{ tenantId: number, role: Role }[]> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('tenantId, role')
      .eq('userId', userId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Mandanten", "danger");
      throw error;
    }

    return data;
  }

  async getTenantsFromUser(userId: string): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*, tenantId(*)')
      .eq('userId', userId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Mandanten", "danger");
      throw error;
    }

    const linkedTenants = await this.getLinkedTenants();

    return data
      .map((tu) => {
        return {
          ...(tu as any).tenantId,
          role: tu.role,
        }
      })
      .filter((t: Tenant) => linkedTenants.find((lt) => lt.id === t.id) && t.role !== Role.VIEWER);
  }

  async getUsersFromTenant(tenantId: number): Promise<TenantUser[]> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .eq('tenantId', tenantId)
      .neq('role', Role.VIEWER);

    if (error) {
      Utils.showToast("Fehler beim Laden der Benutzer", "danger");
      throw error;
    }

    return data;
  }

  async getPersonIdFromTenant(userId: string, tenantId: number): Promise<{ id: number } | null> {
    const { data, error } = await supabase
      .from('player')
      .select('id')
      .eq('appId', userId)
      .eq('tenantId', tenantId)
      .single();

    if (error) {
      console.error(error);
    }

    return data;
  }

  isDemo() {
    return this.user?.email === environment.demoMail;
  }

  async getGroupCategories(tenantId?: number) {
    const { data, error } = await supabase
      .from('group_categories')
      .select('*')
      .eq('tenant_id', tenantId ?? this.tenant().id)
      .order('name', { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Kategorien", "danger");
      throw error;
    }

    return data;
  }

  async addGroupCategory(name: string) {
    const { data, error } = await supabase
      .from('group_categories')
      .insert({
        name,
        tenant_id: this.tenant().id,
      })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Hinzufügen der Kategorie", "danger");
      throw error;
    }

    return data;
  }

  async updateGroupCategory(id: number, name: string) {
    const { data, error } = await supabase
      .from('group_categories')
      .update({ name })
      .match({ id })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren der Kategorie", "danger");
      throw error;
    }

    return data;
  }

  async deleteGroupCategory(id: number) {
    const { error } = await supabase
      .from('group_categories')
      .delete()
      .match({ id });

    if (error) {
      Utils.showToast("Fehler beim Löschen der Kategorie", "danger");
      throw error;
    }

    return;
  }

  async getHolidays(region: string) {
    const holiday = new Holiday();
    const start = dayjs().startOf("year").toDate();
    const end = dayjs().add(1, "year").endOf("year").toDate();
    const publicHolidays = (await holiday.getPublicHolidays("DE", start, end, `DE-${region}`)).map((h) => {
      return {
        ...h,
        gone: dayjs(h.startDate).isBefore(dayjs(), 'day'),
      }
    });
    const schoolHolidays = (await holiday.getSchoolHolidays("DE", start, end, `DE-${region}`, "DE")).map((h) => {
      return {
        ...h,
        gone: dayjs(h.startDate).isBefore(dayjs(), 'day'),
      }
    });
    return { publicHolidays, schoolHolidays };
  }

  async getAdmins(): Promise<Admin[]> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('email, userId, created_at')
      .eq('role', Role.ADMIN)
      .eq('tenantId', this.tenant().id);

    if (error) {
      Utils.showToast("Fehler beim Laden der Admins", "danger");
      throw error;
    }

    return data.filter((e: Admin) => Boolean(e) && e.email !== "developer@attendix.de");
  }

  async createAdmin(admin: string) {
    return await this.registerUser(admin as string, "" as string, Role.ADMIN);
  }

  async activatePlayer(player: Player): Promise<void> {
    if (player.email) {
      await this.createAccount(player);
    }

    player.history.push({
      date: new Date().toISOString(),
      text: "Person wieder aktiviert",
      type: PlayerHistoryType.RETURNED,
    });

    await supabase
      .from('player')
      .update({ left: null, history: player.history as any })
      .match({ id: player.id });

    await this.addPlayerToUpcomingAttendances(player.id, player.instrument);
  }

  async createOrganisation(name: string): Promise<Organisation> {
    const { data, error } = await supabase
      .from('tenant_groups')
      .insert({
        name,
      })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Erstellen der Organisation", "danger");
      throw error;
    }

    await this.linkTenantToOrganisation(this.tenant().id, data);

    return data;
  }

  async linkTenantToOrganisation(tenantId: number, organisation: Organisation): Promise<void> {
    const { error } = await supabase
      .from('tenant_group_tenants')
      .insert({
        tenant_id: tenantId,
        tenant_group: organisation.id,
      });

    if (error) {
      Utils.showToast("Fehler beim Verknüpfen der Organisation", "danger");
      throw error;
    }

    this.organisation.set(organisation);

    return;
  }

  async unlinkTenantFromOrganisation(orgId: number): Promise<void> {
    const { error } = await supabase
      .from('tenant_group_tenants')
      .delete()
      .eq('tenant_id', this.tenant().id)
      .eq('tenant_group', orgId);

    if (error) {
      Utils.showToast("Fehler beim Entfernen der Organisation", "danger");
      throw error;
    }

    // check if there are still tenants in the organisation if not delete the organisation
    const { data, error: fetchError } = await supabase
      .from('tenant_group_tenants')
      .select('*')
      .eq('tenant_group', orgId);

    if (fetchError) {
      Utils.showToast("Fehler beim Entfernen der Organisation", "danger");
      throw fetchError;
    }

    if (data.length === 0) {
      await supabase
        .from('tenant_groups')
        .delete()
        .match({ id: orgId });
    }

    return;
  }

  async getOrganisationFromTenant(): Promise<Organisation | null> {
    const { data, error } = await supabase
      .from('tenant_group_tenants')
      .select('*, tenant_group_data:tenant_group(*)')
      .eq('tenant_id', this.tenant().id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      Utils.showToast("Fehler beim Laden der Organisation", "danger");
      throw error;
    }

    return data.tenant_group_data;
  }

  async getOrganisationsFromUser(): Promise<Organisation[]> {
    const { data: tenants, error: fetchError } = await supabase
      .from('tenantUsers')
      .select('*, tenantId(*)')
      .eq('userId', this.tenantUser().userId)
      .or('role.eq.1, role.eq.5');

    if (fetchError) {
      Utils.showToast("Fehler beim Laden der Mandanten", "danger");
      throw fetchError;
    }

    const { data, error } = await supabase
      .from('tenant_group_tenants')
      .select('*, tenant_group_data:tenant_group(*)')
      .in('tenant_id', tenants.map(t => t.tenantId.id));

    if (error) {
      Utils.showToast("Fehler beim Laden der Organisationen", "danger");
      throw error;
    }

    // make sure there are no duplicates
    const uniqueOrgs = Array.from(new Set(data.map(d => d.tenant_group_data.id)))
      .map(id => {
        return data.find(d => d.tenant_group_data.id === id).tenant_group_data;
      });

    return uniqueOrgs;
  }

  async getTenantsFromOrganisation(): Promise<Tenant[]> {
    const organisation = await this.getOrganisationFromTenant();
    if (!organisation) {
      return [];
    }

    const { data, error } = await supabase
      .from('tenant_group_tenants')
      .select('*, tenant:tenant_id(*)')
      .eq('tenant_group', organisation.id);

    if (error) {
      Utils.showToast("Fehler beim Laden der Mandanten", "danger");
      throw error;
    }

    return data.map(d => d.tenant).filter(t => t.id !== this.tenant().id) as unknown as Tenant[];
  }

  async handoverPersons(persons: Player[], targetTenant: Tenant, groupMapping: { [key: number]: number } = {}, stayInInstance: boolean, mainGroup: number | null): Promise<Player[]> {
    const failedPersons: Player[] = [];

    for (const person of persons) {
      try {
        await this.handoverPerson(person, targetTenant, groupMapping[person.id], stayInInstance, mainGroup);
      } catch (error) {
        failedPersons.push(person);
      }
    }

    return failedPersons;
  }

  async handoverPerson(person: Player, targetTenant: Tenant, groupId: number, stayInInstance: boolean = false, mainGroup: number | null): Promise<void> {
    const newPerson: Player = {
      tenantId: targetTenant.id,
      firstName: person.firstName,
      lastName: person.lastName,
      instrument: groupId,
      img: person.img || DEFAULT_IMAGE,
      joined: new Date().toISOString(),
      email: person.email,
      appId: person.appId,
      hasTeacher: person.hasTeacher,
      teacher: person.teacher,
      playsSince: person.playsSince,
      correctBirthday: person.correctBirthday,
      birthday: person.birthday,
      isLeader: false,
      isCritical: false,
      notes: person.notes,
      history: [],
    };

    if (stayInInstance) {
      newPerson.history.push({
        date: new Date().toISOString(),
        text: `Person wurde von der Instanz "${this.tenant().longName}" übertragen.`,
        type: PlayerHistoryType.COPIED_FROM,
      });
    } else {
      newPerson.history.push({
        date: new Date().toISOString(),
        text: `Person wurde von der Instanz "${this.tenant().longName}" übertragen.`,
        type: PlayerHistoryType.TRANSFERRED_FROM,
      });
    }

    await this.addPlayer(newPerson, true, groupId === mainGroup ? Role.RESPONSIBLE : Role.PLAYER, targetTenant.id);
    if (stayInInstance) {
      await this.updatePlayer({
        ...person,
        history: person.history.concat([{
          date: new Date().toISOString(),
          text: `Person wurde zu "${targetTenant.longName}" kopiert.`,
          type: PlayerHistoryType.COPIED_TO,
        }])
      });
    } else {
      await this.updatePlayer({
        ...person,
        history: person.history.concat([{
          date: new Date().toISOString(),
          text: `Person wurde zu "${targetTenant.longName}" übertragen.`,
          type: PlayerHistoryType.TRANSFERRED_TO,
        }]),
        left: new Date().toISOString(),
      });
    }
  }

  private async getAttendanceTypes(): Promise<AttendanceType[]> {
    const { data, error } = await supabase
      .from('attendance_types')
      .select('*')
      .eq('tenant_id', this.tenant().id)
      .order('index', { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Anwesenheitstypen", "danger");
      throw error;
    }

    return data.map((att: any): AttendanceType => {
      return {
        ...att,
        default_plan: att.default_plan as any,
      };
    });
  }

  async getAttendanceType(id: string): Promise<AttendanceType> {
    const { data, error } = await supabase
      .from('attendance_types')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      Utils.showToast("Fehler beim Laden des Anwesenheitstyps", "danger");
      throw error;
    }

    return data as any;
  }

  async updateAttendanceType(id: string, attType: Partial<AttendanceType>): Promise<AttendanceType> {
    const { data, error } = await supabase
      .from('attendance_types')
      .update(attType as any)
      .match({ id })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren des Anwesenheitstyps", "danger");
      throw error;
    }

    this.attendanceTypes.set(await this.getAttendanceTypes());

    return data as any;
  }

  async addAttendanceType(attType: AttendanceType): Promise<AttendanceType> {
    const { data, error } = await supabase
      .from('attendance_types')
      .insert(attType as any)
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Hinzufügen des Anwesenheitstyps", "danger");
      throw error;
    }

    this.attendanceTypes.set(await this.getAttendanceTypes());

    return data as any;
  }

  async deleteAttendanceType(id: string): Promise<void> {
    const { error } = await supabase
      .from('attendance_types')
      .delete()
      .match({ id });

    if (error) {
      Utils.showToast("Fehler beim Löschen des Anwesenheitstyps", "danger");
      throw error;
    }

    this.attendanceTypes.set(await this.getAttendanceTypes());

    return;
  }

  async getTenantBySongSharingId(sharingId: string): Promise<Tenant | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('song_sharing_id', sharingId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      Utils.showToast("Fehler beim Laden des Tenants", "danger");
      throw error;
    }

    return data as unknown as Tenant;
  }

  async loadShifts(): Promise<void> {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('tenant_id', this.tenant().id)
      .order('name', { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Schichten", "danger");
      throw error;
    }

    this.shifts.set((data as any).map((shift: ShiftPlan) => {
      return {
        ...shift,
        definition: (shift.definition || []).sort((a: ShiftDefinition, b: ShiftDefinition) => {
          return a.index - b.index;
        }),
      }
    }));
    return;
  }

  async addShift(shift: ShiftPlan): Promise<ShiftPlan> {
    const { error } = await supabase
      .from('shifts')
      .insert({
        ...shift,
        tenant_id: this.tenant().id,
        definition: [],
        shifts: [],
      });

    if (error) {
      Utils.showToast("Fehler beim Hinzufügen der Schicht", "danger");
      throw error;
    }

    await this.loadShifts();

    return this.shifts().find(s => s.name === shift.name);
  }

  async updateShift(shift: ShiftPlan): Promise<ShiftPlan> {
    const { error } = await supabase
      .from('shifts')
      .update(shift as any)
      .match({ id: shift.id });

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren der Schicht", "danger");
      throw error;
    }

    await this.loadShifts();

    return;
  }

  async deleteShift(id: string): Promise<void> {
    const { error } = await supabase
      .from('shifts')
      .delete()
      .match({ id });

    if (error) {
      Utils.showToast("Fehler beim Löschen der Schicht", "danger");
      throw error;
    }

    await this.loadShifts();

    return;
  }
}
