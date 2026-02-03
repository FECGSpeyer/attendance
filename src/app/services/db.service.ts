import { Injectable, WritableSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, Platform } from '@ionic/angular';
import { createClient, SupabaseClient, SupabaseClientOptions, User } from '@supabase/supabase-js';
import axios from 'axios';
import * as dayjs from 'dayjs';
import { environment } from 'src/environments/environment';
import { AttendanceStatus, DEFAULT_IMAGE, PlayerHistoryType, Role, SupabaseTable } from '../utilities/constants';
import { Attendance, History, Group, Meeting, Person, Player, PlayerHistoryEntry, Song, Teacher, Tenant, TenantUser, Viewer, PersonAttendance, NotificationConfig, Parent, Admin, Organisation, AttendanceType, ShiftPlan, ShiftDefinition, Church, SongCategory, CrossTenantPersonAttendance } from '../utilities/interfaces';
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
            firstName, lastName, img, instrument(id, name), joined, appId, additional_fields
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
  public churches: WritableSignal<Church[] | undefined>;
  public songCategories: WritableSignal<SongCategory[]>;

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
    this.churches = signal([]);
    this.songCategories = signal([]);
    this.plt.ready().then(() => {
      this.checkToken(true);
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

  async downloadSongFileFromTenant(filePath): Promise<Blob> {
    const { data, error } = await supabase.storage
      .from('songs')
      .download(filePath);

    if (error) throw new Error(error.message);

    return data;
  }

  async uploadSongFileToTenant(
    songId: number,
    blob: Blob,
    fileName: string,
    fileType: string,
    targetTenantId: number,
    instrumentId: number | null,
    note?: string
  ): Promise<SongFile> {
    const fileId = this.encodeFilename(fileName);
    const filePath = `songs/${targetTenantId}/${songId}/${fileId}`;

    const { error } = await supabase.storage
      .from('songs')
      .upload(filePath, blob, { upsert: true });
    if (error) throw new Error(error.message);

    const { data } = await supabase.storage
      .from('songs')
      .getPublicUrl(filePath);

    return {
      storageName: fileId,
      fileName,
      fileType,
      url: data.publicUrl,
      instrumentId,
      note,
      created_at: new Date().toISOString(),
    };
  }

  async copySongToTenant(
    song: Song,
    targetTenantId: number,
    instrumentMapping: { [key: number]: number | null },
    onProgress?: (current: number, total: number) => void
  ): Promise<Song> {
    const sourceTenantId = this.tenant().id;

    // 1. Create new song in target tenant (without files, category = null)
    const newSong: Song = {
      name: song.name,
      number: song.number,
      prefix: song.prefix,
      withChoir: song.withChoir,
      withSolo: song.withSolo,
      link: song.link,
      difficulty: song.difficulty,
      instrument_ids: [],
      category: null,
    };

    const { data, error: insertError } = await supabase
      .from('songs')
      .insert({ ...newSong, tenantId: targetTenantId } as any)
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    const createdSong = data as unknown as Song;

    // 2. Copy all files
    if (song.files?.length) {
      const newFiles: SongFile[] = [];
      const totalFiles = song.files.length;

      for (let i = 0; i < song.files.length; i++) {
        const file = song.files[i];
        if (onProgress) onProgress(i + 1, totalFiles);

        // Download from source tenant
        const blob = await this.downloadSongFileFromTenant(
          file.url.split("https://ultyjzgwejpehfjuyenr.supabase.co/storage/v1/object/public/songs/")[1]
        );

        // Map instrument ID
        const mappedInstrumentId = file.instrumentId
          ? (instrumentMapping[file.instrumentId] ?? null)
          : null;

        // Upload to target tenant
        const newFile = await this.uploadSongFileToTenant(
          createdSong.id,
          blob,
          file.fileName,
          file.fileType,
          targetTenantId,
          mappedInstrumentId,
          file.note
        );

        newFiles.push(newFile);
      }

      // Update song with files and instrument_ids
      const filesJson = newFiles.map(f => ({
        storageName: f.storageName,
        fileName: f.fileName,
        fileType: f.fileType,
        url: f.url,
        instrumentId: f.instrumentId ?? null,
        note: f.note,
      }));

      await supabase
        .from('songs')
        .update({
          files: filesJson,
          instrument_ids: Array.from(new Set(
            filesJson
              .map(f => f.instrumentId)
              .filter(id => id !== null && id !== 1 && id !== 2)
          ))
        })
        .match({ id: createdSong.id });
    }

    return createdSong;
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

  async checkToken(showSelector: boolean = false) {
    if (this.tenantUser()) {
      return;
    }
    const { data } = await supabase.auth.getUser();

    if (data?.user?.email) {
      this.user = data.user;
      await this.setTenant(undefined, showSelector);
    }
  }

  async setTenant(tenantId?: number, showSelector: boolean = false, loading?: HTMLIonLoadingElement) {
    let loader;
    this.tenantUsers.set((await this.getTenantsByUserId()));

    if (this.tenantUsers().length === 0) {
      this.tenants.set([]);
      this.tenantUser.set(undefined);
      this.tenant.set(undefined);
      return;
    }

    this.tenants.set(await this.getTenants());
    const storedTenantId: string | null = tenantId || this.user.user_metadata?.currentTenantId;
    const wantSelection: boolean = (this.user.user_metadata?.wantInstanceSelection || false) && showSelector;
    if (!wantSelection && storedTenantId && this.tenants().find((t: Tenant) => t.id === Number(storedTenantId))) {
      this.tenant.set(this.tenants().find((t: Tenant) => t.id === Number(storedTenantId)));
    } else if (wantSelection) {
      await loading?.dismiss();
      const tenantId = await this.getWantedTenant(Number(storedTenantId));
      if (tenantId !== Number(storedTenantId)) {
        loader = await Utils.getLoadingElement();
        await loader.present();
        this.tenant.set(this.tenants().find((t: Tenant) => t.id === tenantId));
      } else {
        if (loading) {
          const load = await Utils.getLoadingElement(1500);
          await load.present();
        }
        return;
      }
    } else {
      this.tenant.set(this.tenants()[0]);
    }

    if (this.user.user_metadata?.currentTenantId !== this.tenant().id) {
      this.user.user_metadata.currentTenantId = this.tenant().id;
      supabase.auth.updateUser({
        data: {
          currentTenantId: this.tenant().id,
          wantInstanceSelection: this.user.user_metadata?.wantInstanceSelection || false,
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

    if (this.tenant().additional_fields?.find(field => field.id === 'bfecg_church')) {
      if (!this.churches() || this.churches().length === 0) {
        this.churches.set(await this.getChurches());
      }
    }

    await this.getSongCategories();
    await this.loadShifts();
    await loader?.dismiss();
  }

  async getWantedTenant(tenantId?: number): Promise<number> {
    return new Promise<number>(async (resolve) => {
      const alert = await new AlertController().create({
        header: 'Instanz auswählen',
        message: 'Bitte wähle die Instanz aus, die du öffnen möchtest:',
        backdropDismiss: false,
        inputs: this.tenants().map(t => ({
          name: t.longName,
          type: 'radio',
          label: t.longName,
          value: t.id.toString(),
          checked: tenantId ? t.id === tenantId : false,
        })),
        buttons: [
          {
            text: 'Abbrechen',
            role: 'destructive',
            handler: () => {
              resolve(tenantId ?? this.tenants()[0].id);
            }
          },
          {
            text: 'Öffnen',
            handler: (tenantId: string) => {
              resolve(Number(tenantId));
            }
          }
        ]
      });

      await alert.present();
    });
  }

  isBeta() {
    return this.tenantUser()?.email?.endsWith("@attendix.de") || this.user?.email?.toLocaleLowerCase().endsWith("erwinfast98@gmail.com");
  }

  async getTenants(): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .in('id', this.tenantUsers().map(tu => tu.tenantId))
      .order('longName', { ascending: true });

    if (error) {
      throw new Error("Fehler beim Laden der Tenants");
    }

    return data.map(t => {
      return {
        ...t,
        favorite: this.tenantUsers().find(tu => tu.tenantId === t.id)?.favorite || false,
      }
    }).sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
    }) as unknown as Tenant[];
  }

  async updateTenantData(tenant: Partial<Tenant>): Promise<Tenant> {
    delete tenant.favorite;
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

  async registerUser(
    email: string,
    name: string,
    role: Role,
    tenantId?: number,
    password?: string,
    tenantName?: string,
    self_register?: boolean,
  ): Promise<string> {
    const { userId, alreadyThere } = await this.getAppIdByEmail(email, tenantId || this.tenant().id, role) || {};

    if (userId) {
      if (alreadyThere) {
        if (role === Role.ADMIN) {
          try {
            await this.updateTenantUser({ role: Role.ADMIN }, userId);
          } catch (error) {
            throw new Error('Fehler beim Aktualisieren der Benutzerrolle');
          }
        }

        return userId;
      }
      await this.addUserToTenant(userId, role, email, tenantId);
      if (!self_register) {
        const res = await axios.post(`https://staccato-server.vercel.app/api/informAttendixUser`, {
          email,
          name,
          password,
          role: Utils.getRoleText(role),
          tenant: tenantName ?? this.tenant().longName,
        });

        if (!res.data.mailSent) {
          throw new Error('Fehler beim Informieren des Benutzers');
        }
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
        await this.addUserToTenant(data[0].id, role, email, tenantId);
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

  async informUserAboutApproval(email: string, name: string, role: Role): Promise<void> {
    const res = await axios.post(`https://staccato-server.vercel.app/api/approveAttendixUser`, {
      email,
      name,
      role: Utils.getRoleText(role),
      tenant: this.tenant().longName,
    });

    if (!res.data.mailSent) {
      throw new Error('Fehler beim Informieren des Benutzers');
    }
  }

  async informUserAboutReject(email: string, name: string): Promise<void> {
    const res = await axios.post(`https://staccato-server.vercel.app/api/rejectAttendixUser`, {
      email,
      name,
      tenant: this.tenant().longName,
    });

    if (!res.data.mailSent) {
      throw new Error('Fehler beim Informieren des Benutzers');
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

  async getAppIdByEmail(email: string, tenantId: number, role?: Role): Promise<{
    userId: string,
    alreadyThere: boolean,
  } | undefined> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .ilike('email', `%${email}%`);

    const foundTenantUser = data.find((tenantUser: TenantUser) => tenantUser.tenantId === tenantId);

    if (foundTenantUser && foundTenantUser.role !== Role.ADMIN) {
      if (role === Role.ADMIN) {
        return {
          userId: foundTenantUser.userId,
          alreadyThere: true,
        }
      }

      if (
        foundTenantUser.role === Role.PLAYER ||
        foundTenantUser.role === Role.RESPONSIBLE ||
        foundTenantUser.role === Role.APPLICANT ||
        foundTenantUser.role === Role.HELPER
      ) {
        const { data: playersData, error: playersError } = await supabase
          .from('player')
          .select('*')
          .eq('tenantId', tenantId)
          .eq('appId', foundTenantUser.userId);

        if (playersError) {
          throw new Error('Fehler beim Laden des Benutzers');
        }

        if (playersData.length) {
          throw new Error(`Der Benutzer ist bereits in diesem Mandanten: ${playersData[0].firstName} ${playersData[0].lastName} (${Utils.getRoleText(foundTenantUser.role)})`);
        } else {
          await supabase
            .from('tenantUsers')
            .delete()
            .match({ tenantId, userId: foundTenantUser.userId });

          return undefined;
        }
      } else if (foundTenantUser.role === Role.PARENT) {
        const { data: parentsData, error: parentsError } = await supabase
          .from('parents')
          .select('*')
          .eq('tenantId', tenantId)
          .eq('appId', foundTenantUser.userId);

        if (parentsError) {
          throw new Error('Fehler beim Laden des Benutzers');
        }

        if (parentsData.length) {
          throw new Error(`Der Benutzer ist bereits in dieser Instanz: ${parentsData[0].firstName} ${parentsData[0].lastName} (Elternteil)`);
        } else {
          await supabase
            .from('tenantUsers')
            .delete()
            .match({ tenantId, userId: foundTenantUser.userId });
          return undefined;
        }
      } else if (foundTenantUser.role === Role.VIEWER) {
        const { data: viewersData, error: viewersError } = await supabase
          .from('viewers')
          .select('*')
          .eq('tenantId', tenantId)
          .eq('appId', foundTenantUser.userId);

        if (viewersError) {
          throw new Error('Fehler beim Laden des Benutzers');
        }

        if (viewersData.length) {
          throw new Error(`Der Benutzer ist bereits in diesem Mandanten: ${viewersData[0].firstName} ${viewersData[0].lastName} (Beobachter)`);
        } else {
          await supabase
            .from('tenantUsers')
            .delete()
            .match({ tenantId, userId: foundTenantUser.userId });
          return undefined;
        }
      } else {
        throw new Error('Der Benutzer ist bereits in diesem Mandanten');
      }
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

  async changePassword(password: string) {
    await supabase.auth.updateUser({
      password,
    })
  }

  async login(email: string, password: string, returnEarly: boolean = false, loading?: HTMLIonLoadingElement): Promise<boolean> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email, password,
    });

    if (error) {
      switch (error.code) {
        case "invalid_login_credentials":
          Utils.showToast("Ungültige Anmeldedaten", "danger");
          break;
        case "user_disabled":
          Utils.showToast("Dein Konto wurde deaktiviert. Bitte wende dich an den Administrator deiner Instanz.", "danger");
          break;
        case "too_many_requests":
          Utils.showToast("Zu viele Anmeldeversuche. Bitte versuche es später erneut.", "danger");
          break;
        case "invalid_email":
          Utils.showToast("Ungültige E-Mail Adresse", "danger");
          break;
        case "invalid_password":
          Utils.showToast("Ungültiges Passwort", "danger");
          break;
        case "user_not_found":
          Utils.showToast("Benutzer nicht gefunden", "danger");
          break;
        case "email_not_confirmed":
          Utils.showToast("Bitte bestätige zuerst deine E-Mail-Adresse.", "danger");
          break;
        case "password_strength_insufficient":
          Utils.showToast("Das Passwort erfüllt nicht die Sicherheitsanforderungen.", "danger");
          break;
        case "invalid_credentials":
          Utils.showToast("Ungültige Anmeldedaten", "danger");
          break;
        case "email_not_confirmed":
          Utils.showToast("Bitte bestätige zuerst deine E-Mail-Adresse.", "danger");
          break;
        default:
          Utils.showToast(error.code === "email_not_confirmed" ? "Bitte bestätige zuerst deine E-Mail-Adresse." : "Fehler beim Anmelden", "danger");
          break;
      }
      throw error;
    }

    if (data.user) {
      this.user = data.user;

      if (returnEarly) {
        return true;
      }

      await this.setTenant(undefined, true, loading);
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

  async register(email: string, password: string): Promise<{ user: User, new: boolean } | null> {
    const { error, data } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `https://attendix.de/login`,
      }
    });

    if (error) {
      Utils.showToast("Fehler beim Registrieren", "danger");
      return null;
    }

    if (!data.user?.identities?.length) {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email, password,
      });

      if (loginError) {
        throw new Error('Deine E-Mail-Adresse existiert bereits. Bitte melde dich an.');
      }

      return {
        user: loginData.user,
        new: false,
      };
    }

    return {
      user: data.user,
      new: true,
    };
  }

  async getPlayerProfile(): Promise<Player | null> {
    try {
      const player: Player = await this.getPlayerByAppId(false);
      return player;
    } catch (_) {
      return null;
    }
  }

  async updateProfile(updates: Partial<Player>, churchId?: string): Promise<void> {
    const { error } = await supabase
      .from('player')
      .update(updates as any)
      .match({ appId: this.user.id });

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren des Profils", "danger");
      throw error;
    }

    if (churchId) {
      const { data: players } = await supabase
        .from('player')
        .select('*')
        .eq('appId', this.user.id);

      if (players && players.length > 0) {
        for (const player of players) {
          const additional_fields: any = player.additional_fields || {};
          if (additional_fields?.bfecg_church && additional_fields.bfecg_church !== churchId) {
            additional_fields.bfecg_church = churchId;
            const { error: updateError } = await supabase
              .from('player')
              .update({ additional_fields })
              .match({ id: player.id });

            if (updateError) {
              Utils.showToast("Fehler beim Aktualisieren der Kirchenzuordnung", "danger");
              throw updateError;
            }
          }
        }
      }
    }

    return;
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
        .is('pending', false)
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
        .is('pending', false)
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
      .is('pending', false)
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

  async getPendingPersons(): Promise<Player[]> {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .is('pending', true)
      .eq('tenantId', this.tenant().id)
      .order("created_at", { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    return data.map((player: any) => {
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

  async getLeftPlayers(): Promise<Player[]> {
    const { data } = await supabase
      .from('player')
      .select('*')
      .eq('tenantId', this.tenant().id)
      .is('pending', false)
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
      .is('pending', false)
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
      .is('pending', false)
      .eq('tenantId', tenantId ?? this.tenant().id)
      .order("lastName");

    if (error) {
      Utils.showToast("Fehler beim Laden der Hauptgruppen-Personen", "danger");
      throw new Error("Fehler beim Laden der Personen");
    }

    return (all ? data : data.filter((c: any) => !c.left) as unknown as Person[]).map((con: any) => { return { ...con, img: con.img || DEFAULT_IMAGE } });
  }

  async addPlayer(
    player: Player,
    register: boolean,
    role: Role,
    tenantId?: number,
    password?: string,
    tenantName?: string,
  ): Promise<{ userId: number; created: boolean }> {
    let created = false;
    if (!this.tenant()?.maintainTeachers) {
      delete player.teacher;
    }

    if (!this.user && password) {
      try {
        const { user, new: isNew } = await this.register(player.email, password);
        created = isNew;
        await this.addUserToTenant(user?.id, role, player.email, tenantId);
        player.appId = user?.id;
      } catch (error) {
        throw new Error(`Fehler beim Erstellen des Accounts: ${error.message}`);
      }
    } else if (player.email && register && role) {
      const appId: string = await this.registerUser(
        player.email,
        player.firstName,
        role,
        tenantId,
        password,
        tenantName,
        player.self_register,
      );
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

    if (!player.pending) {
      await this.addPlayerToAttendancesByDate(data as unknown as Player, tenantId);
    }

    return {
      userId: data.id,
      created,
    };
  }

  async addPlayerToAttendancesByDate(player: Player, tenantId?: number) {
    const attData: Attendance[] = await this.getAttendancesByDate(player.joined, tenantId);
    let attendanceTypes: AttendanceType[] = this.attendanceTypes();

    if (tenantId) {
      attendanceTypes = await this.getAttendanceTypes(tenantId);
    }

    if (attData?.length) {
      const attToAdd: PersonAttendance[] = attData
        .filter((att: Attendance) => {
          const attType = attendanceTypes.find((type: AttendanceType) => type.id === att.type_id);
          return attType.relevant_groups.length === 0 || attType.relevant_groups.includes(player.instrument);
        })
        .filter((att: Attendance) => {
          const attType = attendanceTypes.find((type: AttendanceType) => type.id === att.type_id);
          if (attType.additional_fields_filter?.key && attType.additional_fields_filter?.option && this.tenant().additional_fields?.find(field => field.id === attType.additional_fields_filter.key)) {
            const defaultValue = this.tenant().additional_fields.find(field => field.id === attType.additional_fields_filter.key)?.defaultValue;
            const additionalField = player.additional_fields[attType.additional_fields_filter.key] ?? defaultValue;
            return additionalField === attType.additional_fields_filter.option;
          }

          return true;
        })
        .map((att: Attendance) => {
          const type = attendanceTypes.find((type: AttendanceType) => type.id === att.type_id);

          return {
            attendance_id: att.id,
            person_id: player.id,
            notes: "",
            status: type.default_status,
          }
        });

      if (attToAdd.length === 0) {
        return;
      }
      await this.addPersonAttendances(attToAdd);
    }
  }

  async addPlayerToUpcomingAttendances(person: Person, group: number, shiftId?: string) {
    const attData: Attendance[] = await this.getUpcomingAttendances();

    if (attData?.length) {
      const attToAdd: PersonAttendance[] = attData
        .filter((att: Attendance) => {
          const attType = this.attendanceTypes().find((type: AttendanceType) => type.id === att.type_id);
          return attType.relevant_groups.length === 0 || attType.relevant_groups.includes(group);
        })
        .filter((att: Attendance) => {
          const attType = this.attendanceTypes().find((type: AttendanceType) => type.id === att.type_id);
          if (attType.additional_fields_filter?.key && attType.additional_fields_filter?.option && this.tenant().additional_fields?.find(field => field.id === attType.additional_fields_filter.key)) {
            const defaultValue = this.tenant().additional_fields.find(field => field.id === attType.additional_fields_filter.key)?.defaultValue;
            const additionalField = person.additional_fields[attType.additional_fields_filter.key] ?? defaultValue;
            return additionalField === attType.additional_fields_filter.option;
          }

          return true;
        })
        .map((att: Attendance) => {
          const attType = this.attendanceTypes().find((type: AttendanceType) => type.id === att.type_id);

          if (!attType) {
            throw new Error("Fehler beim Laden des Anwesenheitstyps");
          }

          let status = attType.default_status;
          let notes = "";

          if (shiftId && !attType.all_day) {
            const shift = this.shifts().find((s: ShiftPlan) => s.id === shiftId);

            const result = Utils.getStatusByShift(
              shift,
              att.date,
              att.start_time,
              att.end_time,
              status,
              person.shift_start,
              person.shift_name
            );

            status = result.status;
            notes = result.note;
          }

          return {
            attendance_id: att.id,
            person_id: person.id,
            notes,
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

  async updatePlayer(
    player: Player,
    pausedAction?: boolean,
    createAccount?: boolean,
    role?: Role,
    updateShifts?: boolean
  ): Promise<Player[]> {
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
        this.addPlayerToUpcomingAttendances(player, player.instrument, player.shift_id);
      }
    }

    if (updateShifts) {
      await this.updateShiftAssignmentsForPerson(player);
    }

    return data.map((player) => {
      return {
        ...player,
        history: player.history as any,
      }
    }) as unknown as Player[];
  }

  async checkAndUnpausePlayers(): Promise<void> {
    const today = dayjs().format('YYYY-MM-DD');

    const { data: pausedPlayers, error } = await supabase
      .from('player')
      .select('*')
      .eq('tenantId', this.tenant().id)
      .eq('paused', true)
      .not('paused_until', 'is', null)
      .lte('paused_until', today);

    if (error) {
      console.error("Fehler beim Prüfen pausierter Personen", error);
      return;
    }

    for (const player of pausedPlayers || []) {
      const history: PlayerHistoryEntry[] = (player.history as unknown as PlayerHistoryEntry[]) || [];
      history.push({
        date: new Date().toISOString(),
        text: "Automatisch reaktiviert (Pausendatum erreicht)",
        type: PlayerHistoryType.UNPAUSED,
      });

      await this.updatePlayer({
        ...player,
        paused: false,
        paused_until: null,
        history,
      } as Player, true);

      await this.addPlayerToUpcomingAttendances(player as Person, player.instrument, player.shift_id);
    }
  }

  async updateShiftAssignmentsForPerson(person: Person) {
    const attData: PersonAttendance[] = await this.getPersonAttendances(person.id);
    const shift = this.shifts().find((s: ShiftPlan) => s.id === person.shift_id);
    if (shift) {
      for (const att of attData) {
        if (dayjs(att.attendance.date).isBefore(dayjs(), 'day')) {
          continue;
        }

        const type = this.attendanceTypes().find((type: AttendanceType) => type.id === att.attendance.type_id);
        if (!type) {
          continue;
        }
        const result = Utils.getStatusByShift(
          shift,
          att.attendance?.date,
          att.attendance?.start_time ?? type.start_time,
          att.attendance?.end_time ?? type.end_time,
          type.default_status,
          person.shift_start,
          person.shift_name
        );

        if (result.status === AttendanceStatus.Excused && att.status === type.default_status) {
          await this.updatePersonAttendance(att.id, {
            status: result.status,
            notes: result.note,
          });
        }
      }
    } else {
      for (const att of attData) {
        if (dayjs(att.attendance.date).isBefore(dayjs(), 'day')) {
          continue;
        }

        if (att.notes?.includes("Schichtbedingt")) {
          const type = this.attendanceTypes().find((type: AttendanceType) => type.id === att.attendance.type_id);
          if (!type) {
            continue;
          }

          await this.updatePersonAttendance(att.id, {
            status: type.default_status,
            notes: "",
          });
        }
      }
    }
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

    if (this.tenant() && this.tenant().id) {
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
      .select('*, attendance:attendance_id(id, date, type, typeInfo, songs, type_id, start_time, end_time, deadline)')
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
        attendance: att.attendance,
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
      .update({
        ...att,
        changed_by: this.user?.id || null,
        changed_at: new Date().toISOString(),
      })
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

  async getSongCategories(): Promise<SongCategory[]> {
    const { data } = await supabase
      .from('song_categories')
      .select('*')
      .eq('tenant_id', this.tenant().id)
      .order("index", {
        ascending: true,
      });

    this.songCategories.set(data);

    return data;
  }

  async addSongCategory(category: Partial<SongCategory>) {
    const { error } = await supabase
      .from('song_categories')
      .insert({
        ...category,
        tenant_id: this.tenant().id,
      } as SongCategory)
      .select();

    if (error) {
      throw new Error("Fehler beim hinzufügen der Werkkategorie");
    }

    await this.getSongCategories();

    return;
  }

  async updateSongCategory(category: Partial<SongCategory>, id: string): Promise<SongCategory[]> {
    const { data } = await supabase
      .from('song_categories')
      .update(category)
      .match({ id });

    await this.getSongCategories();

    return data;
  }

  async removeSongCategory(id: string): Promise<void> {
    await supabase
      .from('song_categories')
      .delete()
      .match({ id });

    await this.getSongCategories();

    return;
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

  async signin(attId: string, status: string, notes: string = ""): Promise<void> {
    await this.updatePersonAttendance(attId, {
      notes,
      status: AttendanceStatus.Present,
    });

    this.notifyPerTelegram(attId, status, undefined, false, notes);

    return;
  }

  async updateAttendanceNote(attId: string, notes: string): Promise<void> {
    await this.updatePersonAttendance(attId, {
      notes,
    });

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
        sendAsUrl: !url.includes(".pdf"),
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

  async notifyPerTelegram(attId: string, type: string = "signin", reason?: string, isParents: boolean = false, notes: string = ""): Promise<void> {
    await supabase.functions.invoke("quick-processor", {
      body: {
        attId,
        type,
        reason,
        isParents,
        notes
      },
      method: "POST",
    });
  }

  async removeImage(id: number, imgPath: string, newUser: boolean = false, appId: string = "") {
    if (!newUser) {
      if (appId && this.user?.id === appId) {
        await supabase
          .from("player")
          .update({ img: "" })
          .match({ appId });
      } else {
        await supabase
          .from("player")
          .update({ img: "" })
          .match({ id });
      }
    }

    await supabase.storage
      .from("profiles")
      .remove([imgPath]);
  }

  async updateImage(id: number, image: File | Blob, appId: string) {
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

    if (appId && this.user?.id === appId) {
      await supabase
        .from("player")
        .update({ img: data.publicUrl })
        .match({ appId });
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
        registrations: true,
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

  async setFavoriteTenant(tenantId: number, favorite: boolean): Promise<void> {
    const { error } = await supabase
      .from("tenantUsers")
      .update({ favorite })
      .eq("userId", this.user.id)
      .eq("tenantId", tenantId);

    this.tenantUsers.set((await this.getTenantsByUserId()));
    this.tenants.set(await this.getTenants());

    if (error) {
      Utils.showToast("Fehler beim Setzen des Favoriten, bitte versuche es später erneut.", "danger");
      throw new Error(error.message);
    }
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

    await this.addDefaultAttendanceTypes(data.id, tenant.type);

    Utils.showToast("Instanz wurde erfolgreich erstellt!");

    await this.setTenant(data.id);
    this.router.navigateByUrl(Utils.getUrl(Role.ADMIN));
  }

  async addDefaultAttendanceTypes(tenantId: number, type: string): Promise<void> {
    const defaultTypes = Utils.getDefaultAttendanceTypes(tenantId, type);

    const { error } = await supabase
      .from('attendance_types')
      .insert(defaultTypes as any[]);

    if (error) {
      Utils.showToast("Fehler beim Hinzufügen der Standard Anwesenheitstypen", "danger");
      throw error;
    }
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
        .is('pending', false)
        .neq('email', null);

      data = res.data;
      error = res.error;
    } else {
      const res = await supabase
        .from('player')
        .select('*, instrument(name), tenantId(id, shortName, longName)')
        .ilike('firstName', `%${firstName.trim()}%`)
        .ilike('lastName', `%${lastName.trim()}%`)
        .is('pending', false);

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
      .is('pending', false)
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

    await this.addPlayerToUpcomingAttendances(player, player.instrument, player.shift_id);
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

  async getInstancesOfOrganisations(orgId: number): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenant_group_tenants')
      .select('tenant:tenant_id(*)')
      .eq('tenant_group', orgId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Organisationen", "danger");
      throw error;
    }

    return data.map(d => d.tenant as any);
  }

  async getAllPersonsFromOrganisation(tenants: Tenant[]): Promise<Player[]> {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .in('tenantId', tenants.map(t => t.id))
      .is('pending', false)
      .is("left", null)
      .order('lastName', { ascending: true })
      .order('firstName', { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    return data as any;
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
      pending: false,
      self_register: false,
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

  private async getAttendanceTypes(tenantId?: number): Promise<AttendanceType[]> {
    const { data, error } = await supabase
      .from('attendance_types')
      .select('*')
      .eq('tenant_id', tenantId || this.tenant().id)
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

  async getTenantByRegisterId(registerId: string): Promise<Tenant | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('register_id', registerId)
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

  async isShiftUsed(id: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('player')
      .select('id')
      .eq('shift_id', id)
      .limit(1);

    if (error) {
      Utils.showToast("Fehler beim Überprüfen der Schichtverwendung", "danger");
      throw error;
    }

    return data.length > 0;
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

  async getChurches(): Promise<Church[]> {
    const { data, error } = await supabase
      .from('churches')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Kirchen", "danger");
      throw error;
    }

    return data;
  }

  async createChurch(name: string): Promise<string> {
    const { data, error } = await supabase
      .from('churches')
      .insert({
        name,
        created_from: this.user?.id ?? null,
      })
      .select('id')
      .single();

    if (error) {
      Utils.showToast("Fehler beim Erstellen der Kirche", "danger");
      throw error;
    }

    await this.churches.set(await this.getChurches());

    return data.id;
  }

  async sendQuestion(message: string, phone: string): Promise<void> {
    const { error } = await supabase
      .from('questions')
      .insert({
        message,
        phone,
        tenant_id: this.tenant().id,
        user_id: this.user?.id,
      });

    if (error) {
      Utils.showToast("Fehler beim Senden der Frage", "danger");
      throw error;
    }

    return;
  }

  async sendFeedback(message: string, rating: number, anonymous: boolean, phone: string): Promise<void> {
    const { error } = await supabase
      .from('feedback')
      .insert({
        message,
        rating,
        anonymous,
        phone,
        tenant_id: anonymous ? null : this.tenant().id,
        user_id: anonymous ? null : this.user?.id,
      });

    if (error) {
      Utils.showToast("Fehler beim Senden des Feedbacks", "danger");
      throw error;
    }

    return;
  }

  // Cross-Tenant Attendance Overview - Signal-based cache
  public crossTenantAttendances: WritableSignal<CrossTenantPersonAttendance[]> = signal([]);
  public crossTenantAttendancesLoading: WritableSignal<boolean> = signal(false);
  private crossTenantAttendanceTypes: Map<number, AttendanceType[]> = new Map();
  private tenantColors: Map<number, string> = new Map();

  // Predefined distinct colors for better visual separation
  private readonly distinctColors: string[] = [
    '#E53935', // Red
    '#1E88E5', // Blue
    '#43A047', // Green
    '#FB8C00', // Orange
    '#8E24AA', // Purple
    '#00ACC1', // Cyan
    '#F4511E', // Deep Orange
    '#3949AB', // Indigo
    '#7CB342', // Light Green
    '#C2185B', // Pink
    '#00897B', // Teal
    '#6D4C41', // Brown
    '#5E35B1', // Deep Purple
    '#039BE5', // Light Blue
    '#D81B60', // Pink Dark
    '#FFB300', // Amber
  ];

  /**
   * Generates a deterministic color for a tenant based on its index in the user's tenant list
   */
  private getTenantColor(tenantId: number): string {
    if (this.tenantColors.has(tenantId)) {
      return this.tenantColors.get(tenantId)!;
    }
    // Use tenant index in the list for color assignment to ensure distinct colors
    const tenantIds = this.tenantUsers()?.map(tu => tu.tenantId) || [];
    const index = tenantIds.indexOf(tenantId);
    const colorIndex = index >= 0 ? index % this.distinctColors.length : Math.abs(tenantId) % this.distinctColors.length;
    const color = this.distinctColors[colorIndex];
    this.tenantColors.set(tenantId, color);
    return color;
  }

  /**
   * Gets person ID for the current user in a specific tenant
   */
  async getPersonIdForTenant(tenantId: number): Promise<number | null> {
    const { data, error } = await supabase
      .from('player')
      .select('id')
      .eq('tenantId', tenantId)
      .eq('appId', this.user.id)
      .single();

    if (error || !data) {
      return null;
    }
    return data.id;
  }

  /**
   * Gets person attendances for a specific person in a specific tenant
   */
  async getPersonAttendancesForTenant(personId: number, tenantId: number): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('person_attendances')
      .select('*, attendance:attendance_id(id, date, type, typeInfo, songs, type_id, start_time, end_time, deadline)')
      .eq('person_id', personId)
      .gt("attendance.date", this.getCurrentAttDate());

    if (!data) return [];

    const attendanceTypes = this.crossTenantAttendanceTypes.get(tenantId) || [];

    return data.filter((a) => Boolean(a.attendance)).map((att): PersonAttendance => {
      let attText = Utils.getAttText(att);
      const attType = attendanceTypes.find((type: AttendanceType) => type.id === att.attendance.type_id);
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
        attendance: att.attendance,
        highlight: attType ? attType.highlight : att.attendance.type === "vortrag",
      } as any;
    });
  }

  /**
   * Gets attendance types for multiple tenants in parallel
   */
  async getAttendanceTypesForTenants(tenantIds: number[]): Promise<Map<number, AttendanceType[]>> {
    const results = await Promise.all(
      tenantIds.map(async (tenantId) => {
        const { data, error } = await supabase
          .from('attendance_types')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('index', { ascending: true });

        if (error || !data) {
          return { tenantId, types: [] };
        }

        return {
          tenantId,
          types: data.map((att: any): AttendanceType => ({
            ...att,
            default_plan: att.default_plan as any,
          }))
        };
      })
    );

    const typeMap = new Map<number, AttendanceType[]>();
    results.forEach(({ tenantId, types }) => {
      typeMap.set(tenantId, types);
    });

    return typeMap;
  }

  /**
   * Loads all person attendances across all tenants the user belongs to
   * Uses Promise.all for parallel loading and caches results in a signal
   */
  async loadAllPersonAttendancesAcrossTenants(forceRefresh: boolean = false): Promise<CrossTenantPersonAttendance[]> {
    // Return cached data if available and not forcing refresh
    if (!forceRefresh && this.crossTenantAttendances().length > 0) {
      return this.crossTenantAttendances();
    }

    this.crossTenantAttendancesLoading.set(true);

    try {
      const tenantUsers = this.tenantUsers();
      if (!tenantUsers || tenantUsers.length === 0) {
        this.crossTenantAttendances.set([]);
        return [];
      }

      const tenants = this.tenants();
      const tenantIds = tenantUsers.map(tu => tu.tenantId);

      // Load attendance types for all tenants in parallel
      this.crossTenantAttendanceTypes = await this.getAttendanceTypesForTenants(tenantIds);

      // Load person IDs and attendances for all tenants in parallel
      const attendanceResults = await Promise.all(
        tenantUsers.map(async (tu) => {
          const personId = await this.getPersonIdForTenant(tu.tenantId);
          if (!personId) {
            return [];
          }

          const attendances = await this.getPersonAttendancesForTenant(personId, tu.tenantId);
          const tenant = tenants?.find(t => t.id === tu.tenantId);
          const tenantColor = this.getTenantColor(tu.tenantId);
          const attendanceTypes = this.crossTenantAttendanceTypes.get(tu.tenantId) || [];

          return attendances.map((att): CrossTenantPersonAttendance => ({
            ...att,
            tenantId: tu.tenantId,
            tenantName: tenant?.longName || tenant?.shortName || 'Unbekannt',
            tenantColor,
            attendanceType: attendanceTypes.find(t => t.id === att.typeId),
          }));
        })
      );

      // Flatten and sort by date
      const allAttendances = attendanceResults
        .reduce((acc, curr) => acc.concat(curr), [])
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      this.crossTenantAttendances.set(allAttendances);
      return allAttendances;
    } finally {
      this.crossTenantAttendancesLoading.set(false);
    }
  }

  /**
   * Gets the attendance type for a cross-tenant attendance
   */
  getCrossTenantAttendanceType(att: CrossTenantPersonAttendance): AttendanceType | undefined {
    return this.crossTenantAttendanceTypes.get(att.tenantId)?.find(t => t.id === att.typeId);
  }

  /**
   * Clears the cross-tenant attendance cache
   */
  clearCrossTenantCache(): void {
    this.crossTenantAttendances.set([]);
    this.crossTenantAttendanceTypes.clear();
  }
}
