import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, Platform } from '@ionic/angular';
import { createClient, SupabaseClient, SupabaseClientOptions, User } from '@supabase/supabase-js';
import axios from 'axios';
import dayjs from 'dayjs';
import { environment } from 'src/environments/environment';
import { AttendanceStatus, DEFAULT_IMAGE, PlayerHistoryType, Role, SupabaseTable } from '../utilities/constants';
import { Attendance, History, Group, Meeting, Person, Player, PlayerHistoryEntry, Song, Teacher, Tenant, TenantUser, Viewer, PersonAttendance, NotificationConfig, Parent, Admin, Organisation, AttendanceType, ShiftPlan, ShiftDefinition, Church, SongCategory, CrossTenantPersonAttendance } from '../utilities/interfaces';
import { SongFile } from '../utilities/interfaces';
import { Database } from '../utilities/supabase';
import { Utils } from '../utilities/Utils';
import { Holiday } from 'open-holiday-js';

// Import new modular services
import { AuthService } from './auth/auth.service';
import { PlayerService } from './player/player.service';
import { AttendanceService } from './attendance/attendance.service';
import { SongService } from './song/song.service';
import { TenantService } from './tenant/tenant.service';
import { GroupService } from './group/group.service';
import { HistoryService } from './history/history.service';
import { MeetingService } from './meeting/meeting.service';
import { NotificationService } from './notification/notification.service';
import { ImageService } from './image/image.service';
import { ShiftService } from './shift/shift.service';
import { AttendanceTypeService } from './attendance-type/attendance-type.service';
import { OrganisationService } from './organisation/organisation.service';
import { ChurchService } from './church/church.service';
import { FeedbackService } from './feedback/feedback.service';
import { HolidayService } from './holiday/holiday.service';
import { CrossTenantService } from './cross-tenant/cross-tenant.service';
import { AdminService } from './admin/admin.service';
import { HandoverService } from './handover/handover.service';
import { GroupCategoryService } from './group-category/group-category.service';
import { InstanceService } from './instance/instance.service';
import { ProfileService } from './profile/profile.service';
import { UserRegistrationService } from './user-registration/user-registration.service';
import { ViewerParentService } from './viewer-parent/viewer-parent.service';
import { ConductorService } from './conductor/conductor.service';
import { TeacherService } from './teacher/teacher.service';
import { TelegramService } from './telegram/telegram.service';
import { SignInOutService } from './sign-in-out/sign-in-out.service';
import { SongCategoryService } from './song-category/song-category.service';

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

  // Injected modular services - use these for new code
  public readonly authSvc = inject(AuthService);
  public readonly playerSvc = inject(PlayerService);
  public readonly attendanceSvc = inject(AttendanceService);
  public readonly songSvc = inject(SongService);
  public readonly tenantSvc = inject(TenantService);
  public readonly groupSvc = inject(GroupService);
  public readonly historySvc = inject(HistoryService);
  public readonly meetingSvc = inject(MeetingService);
  public readonly notificationSvc = inject(NotificationService);
  public readonly imageSvc = inject(ImageService);
  public readonly shiftSvc = inject(ShiftService);
  public readonly attTypeSvc = inject(AttendanceTypeService);
  public readonly orgSvc = inject(OrganisationService);
  public readonly churchSvc = inject(ChurchService);
  public readonly feedbackSvc = inject(FeedbackService);
  public readonly holidaySvc = inject(HolidayService);
  public readonly crossTenantSvc = inject(CrossTenantService);
  public readonly adminSvc = inject(AdminService);
  public readonly handoverSvc = inject(HandoverService);
  public readonly groupCategorySvc = inject(GroupCategoryService);
  public readonly instanceSvc = inject(InstanceService);
  public readonly profileSvc = inject(ProfileService);
  public readonly userRegistrationSvc = inject(UserRegistrationService);
  public readonly viewerParentSvc = inject(ViewerParentService);
  public readonly conductorSvc = inject(ConductorService);
  public readonly teacherSvc = inject(TeacherService);
  public readonly telegramSvc = inject(TelegramService);
  public readonly signInOutSvc = inject(SignInOutService);
  public readonly songCategorySvc = inject(SongCategoryService);

  constructor(
    private plt: Platform,
    private router: Router,
    private alertController: AlertController,
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
    this.checkDemoRestriction();
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
    this.checkDemoRestriction();
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
      const alert = await this.alertController.create({
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
    this.checkDemoRestriction();
    const data = await this.tenantSvc.updateTenantData(tenant, this.tenant().id);
    this.tenant.set(data);
    return data;
  }

  async getTenantsByUserId(): Promise<TenantUser[]> {
    return this.tenantSvc.getTenantsByUserId(this.user.id);
  }

  async getTenantUserById(id: string): Promise<TenantUser> {
    return this.tenantSvc.getTenantUserById(this.tenant().id, id);
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
    this.checkDemoRestriction();
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
    return this.viewerParentSvc.getViewers(this.tenant().id);
  }

  async deleteParent(parent: Parent): Promise<void> {
    this.checkDemoRestriction();
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
    return this.viewerParentSvc.getParents(this.tenant().id);
  }

  async createViewer(viewer: Partial<Viewer>) {
    this.checkDemoRestriction();
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
    this.checkDemoRestriction();
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
    this.checkDemoRestriction();
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
    return this.userRegistrationSvc.informUserAboutApproval(email, name, role, this.tenant().longName);
  }

  async informUserAboutReject(email: string, name: string): Promise<void> {
    return this.userRegistrationSvc.informUserAboutReject(email, name, this.tenant().longName);
  }

  async addUserToTenant(userId: string, role: Role, email: string, tenantId?: number) {
    return this.userRegistrationSvc.addUserToTenant(userId, role, email, tenantId ?? this.tenant().id);
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
    this.checkDemoRestriction();
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
    this.checkDemoRestriction();
    return this.authSvc.changePassword(password);
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
    return this.playerSvc.getPlayerProfile(this.user.id, this.tenant().id);
  }

  async updateProfile(updates: Partial<Player>, churchId?: string): Promise<void> {
    this.checkDemoRestriction();
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
    return this.playerSvc.getPlayerByAppId(this.user.id, this.tenant().id, showToast);
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
    return this.playerSvc.getPendingPersons(this.tenant().id);
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
    return this.playerSvc.getLeftPlayers(this.tenant().id);
  }

  async getPlayersWithoutAccount(): Promise<Player[]> {
    return this.playerSvc.getPlayersWithoutAccount(this.tenant().id);
  }

  async getConductors(all: boolean = false, tenantId?: number, mainGroupId?: number): Promise<Person[]> {
    const mainGroupIdLocal = mainGroupId ?? this.getMainGroup()?.id;
    if (!mainGroupIdLocal) {
      throw new Error("Hauptgruppe nicht gefunden");
    }
    return this.conductorSvc.getConductors(mainGroupIdLocal, tenantId ?? this.tenant().id, all);
  }

  async addPlayer(
    player: Player,
    register: boolean,
    role: Role,
    tenantId?: number,
    password?: string,
    tenantName?: string,
  ): Promise<{ userId: number; created: boolean }> {
    this.checkDemoRestriction();
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
    this.checkDemoRestriction();
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
    delete dataToUpdate.lateCount;  // Computed field, not stored in DB

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
    this.checkDemoRestriction();
    return this.playerSvc.updatePlayerHistory(id, history);
  }

  async removePlayer(player: Person): Promise<void> {
    this.checkDemoRestriction();
    await this.playerSvc.removePlayer(player);
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
    this.checkDemoRestriction();
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
    return this.groupSvc.getGroups(tenantId ?? this.tenant().id);
  }

  getMainGroup(): Group | undefined {
    return this.groups().find((inst: Group) => { return inst.maingroup; });
  }

  async addGroup(name: string, maingroup: boolean = false, tenantId?: number): Promise<Group[]> {
    this.checkDemoRestriction();
    const data = await this.groupSvc.addGroup(name, tenantId || this.tenant().id, maingroup);
    if (this.tenant() && this.tenant().id) {
      this.groups.set(await this.getGroups());
    }
    return data;
  }

  async updateGroup(att: Partial<Group>, id: number): Promise<Group[]> {
    this.checkDemoRestriction();
    const data = await this.groupSvc.updateGroup(att, id);
    this.groups.set(await this.getGroups());
    return data;
  }

  async removeGroup(id: number): Promise<Group[]> {
    this.checkDemoRestriction();
    const data = await this.groupSvc.removeGroup(id);
    this.groups.set(await this.getGroups());
    return data;
  }

  async addAttendance(attendance: Attendance): Promise<number> {
    this.checkDemoRestriction();
    return this.attendanceSvc.addAttendance(attendance, this.tenant().id);
  }

  async addPersonAttendances(personAttendances: PersonAttendance[]): Promise<void> {
    return this.attendanceSvc.addPersonAttendances(personAttendances);
  }

  async deletePersonAttendances(ids: number[], personId: number): Promise<void> {
    return this.attendanceSvc.deletePersonAttendances(ids, personId);
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
    return this.attendanceSvc.getAttendanceById(id);
  }

  async updateAttendance(att: Partial<Attendance>, id: number): Promise<Attendance> {
    this.checkDemoRestriction();
    return this.attendanceSvc.updateAttendance(att, id);
  }

  async removeAttendance(id: number): Promise<void> {
    this.checkDemoRestriction();
    return this.attendanceSvc.removeAttendance(id);
  }

  async getPersonAttendances(id: number, all: boolean = false): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('person_attendances')
      .select('*, attendance:attendance_id(id, date, type, typeInfo, songs, type_id, start_time, end_time, deadline, plan, share_plan)')
      .eq('person_id', id)
      .gt("attendance.date", all ? dayjs("2020-01-01").toISOString() : this.getCurrentAttDate()) as any;

    return data.filter((a: any) => Boolean(a.attendance)).map((att: any): PersonAttendance => {
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
    return this.attendanceSvc.getParentAttendances(
      player.map(p => p.id),
      attendances.map(a => a.id)
    );
  }

  async updatePersonAttendance(id: string, att: Partial<PersonAttendance>): Promise<void> {
    return this.attendanceSvc.updatePersonAttendance(id, att, this.user?.id);
  }

  async getHistory(tenantId?: number): Promise<History[]> {
    return this.historySvc.getHistory(tenantId ?? this.tenant().id);
  }

  async getHistoryByAttendanceId(attendance_id: number): Promise<History[]> {
    return this.historySvc.getHistoryByAttendanceId(attendance_id, this.tenant().id);
  }

  async updateHistoryEntry(id: number, history: Partial<History>): Promise<History[]> {
    this.checkDemoRestriction();
    return this.historySvc.updateHistoryEntry(id, history);
  }

  async addHistoryEntry(history: History[]): Promise<History[]> {
    this.checkDemoRestriction();
    return this.historySvc.addHistoryEntry(history, this.tenant().id);
  }

  async removeHistoryEntry(id: number): Promise<History[]> {
    this.checkDemoRestriction();
    return this.historySvc.removeHistoryEntry(id);
  }

  async addSongsToHistory(historyEntries: History[]) {
    return this.historySvc.addSongsToHistory(historyEntries);
  }

  async getTeachers(): Promise<Teacher[]> {
    return this.teacherSvc.getTeachers(this.tenant().id);
  }

  async addTeacher(teacher: Teacher): Promise<Teacher[]> {
    this.checkDemoRestriction();
    return this.teacherSvc.addTeacher(teacher, this.tenant().id);
  }

  async updateTeacher(teacher: Partial<Teacher>, id: number): Promise<Teacher[]> {
    this.checkDemoRestriction();
    return this.teacherSvc.updateTeacher(teacher, id);
  }

  async getSongs(tenantId?: number): Promise<Song[]> {
    return this.songSvc.getSongs(tenantId ?? this.tenant().id);
  }

  async getSong(id: number, tenantId?: number): Promise<Song> {
    return this.songSvc.getSong(id, tenantId ?? this.tenant().id);
  }

  async addSong(song: Song): Promise<Song> {
    this.checkDemoRestriction();
    return this.songSvc.addSong(song, this.tenant().id);
  }

  async removeSong(song: Song): Promise<void> {
    this.checkDemoRestriction();
    return this.songSvc.removeSong(song, this.tenant().id);
  }

  async editSong(id: number, song: Song): Promise<Song[]> {
    this.checkDemoRestriction();
    return this.songSvc.editSong(id, song);
  }

  async getSongCategories(): Promise<SongCategory[]> {
    const data = await this.songCategorySvc.getSongCategories(this.tenant().id);
    this.songCategories.set(data);
    return data;
  }

  async addSongCategory(category: Partial<SongCategory>) {
    this.checkDemoRestriction();
    await this.songCategorySvc.addSongCategory(category, this.tenant().id);
    await this.getSongCategories();
  }

  async updateSongCategory(category: Partial<SongCategory>, id: string): Promise<SongCategory[]> {
    this.checkDemoRestriction();
    const data = await this.songCategorySvc.updateSongCategory(category, id);
    await this.getSongCategories();
    return data;
  }

  async removeSongCategory(id: string): Promise<void> {
    this.checkDemoRestriction();
    await this.songCategorySvc.removeSongCategory(id);
    await this.getSongCategories();
  }

  async getMeetings(): Promise<Meeting[]> {
    return this.meetingSvc.getMeetings(this.tenant().id);
  }

  async getMeeting(id: number): Promise<Meeting> {
    return this.meetingSvc.getMeeting(id, this.tenant().id);
  }

  async addMeeting(meeting: Meeting): Promise<Meeting[]> {
    this.checkDemoRestriction();
    return this.meetingSvc.addMeeting(meeting, this.tenant().id);
  }

  async editMeeting(id: number, meeting: Meeting): Promise<Meeting[]> {
    this.checkDemoRestriction();
    return this.meetingSvc.editMeeting(id, meeting);
  }

  async removeMeeting(id: number): Promise<void> {
    this.checkDemoRestriction();
    return this.meetingSvc.removeMeeting(id);
  }

  async signout(attIds: string[], reason: string, isLateExcused: boolean, isParents: boolean = false): Promise<void> {
    return this.signInOutSvc.signout(attIds, reason, isLateExcused, isParents);
  }

  async signin(attId: string, status: string, notes: string = ""): Promise<void> {
    return this.signInOutSvc.signin(attId, status, notes, this.user?.id);
  }

  async updateAttendanceNote(attId: string, notes: string): Promise<void> {
    return this.signInOutSvc.updateAttendanceNote(attId, notes, this.user?.id);
  }

  async sendPlanPerTelegram(blob: Blob, name: string, asImage: boolean = false): Promise<void> {
    return this.telegramSvc.sendPlanPerTelegram(blob, name, this.tenantUser().telegram_chat_id, asImage);
  }

  async sendSongPerTelegram(url: string): Promise<void> {
    return this.telegramSvc.sendSongPerTelegram(url, this.tenantUser().telegram_chat_id);
  }

  async notifyPerTelegram(attId: string, type: string = "signin", reason?: string, isParents: boolean = false, notes: string = ""): Promise<void> {
    return this.telegramSvc.notifyPerTelegram(attId, type, reason, isParents, notes);
  }

  async removeImage(id: number, imgPath: string, newUser: boolean = false, appId: string = "") {
    this.checkDemoRestriction();
    return this.imageSvc.removeImage(id, imgPath, newUser, appId, this.user?.id);
  }

  async updateImage(id: number, image: File | Blob, appId: string) {
    this.checkDemoRestriction();
    return this.imageSvc.updateImage(id, image, appId, this.user?.id);
  }

  async updateAttImage(id: number, image: File) {
    this.checkDemoRestriction();
    return this.imageSvc.updateAttendanceImage(id, image);
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
    return this.notificationSvc.getNotificationConfig(userId);
  }

  async updateNotificationConfig(config: NotificationConfig) {
    return this.notificationSvc.updateNotificationConfig(config);
  }

  async deleteInstance(tenantId: number): Promise<void> {
    this.checkDemoRestriction();
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
    this.checkDemoRestriction();
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
    const linkedTenants = await this.getLinkedTenants();
    return this.crossTenantSvc.getPossiblePersonsByName(firstName, lastName, linkedTenants, onlyWithAccount);
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
    return this.crossTenantSvc.getUserRolesForTenants(userId);
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
    return this.crossTenantSvc.getUsersFromTenant(tenantId);
  }

  async getPersonIdFromTenant(userId: string, tenantId: number): Promise<{ id: number } | null> {
    return this.crossTenantSvc.getPersonIdFromTenant(userId, tenantId);
  }

  isDemo() {
    return this.user?.email === environment.demoMail;
  }

  /**
   * Checks if demo mode is active and throws an error with toast if so.
   * Call this at the beginning of any method that should be restricted in demo mode.
   */
  private checkDemoRestriction(): void {
    if (this.isDemo()) {
      Utils.showToast('Diese Funktion ist im Demo-Modus nicht verfügbar.', 'warning');
      throw new Error('Demo mode restriction');
    }
  }

  async getGroupCategories(tenantId?: number) {
    return this.groupCategorySvc.getGroupCategories(tenantId ?? this.tenant().id);
  }

  async addGroupCategory(name: string) {
    this.checkDemoRestriction();
    return this.groupCategorySvc.addGroupCategory(name, this.tenant().id);
  }

  async updateGroupCategory(id: number, name: string) {
    this.checkDemoRestriction();
    return this.groupCategorySvc.updateGroupCategory(id, name);
  }

  async deleteGroupCategory(id: number) {
    this.checkDemoRestriction();
    return this.groupCategorySvc.deleteGroupCategory(id);
  }

  async getHolidays(region: string) {
    return this.holidaySvc.getHolidays(region);
  }

  async getAdmins(): Promise<Admin[]> {
    return this.adminSvc.getAdmins(this.tenant().id);
  }

  async createAdmin(admin: string) {
    this.checkDemoRestriction();
    return await this.registerUser(admin as string, "" as string, Role.ADMIN);
  }

  async activatePlayer(player: Player): Promise<void> {
    this.checkDemoRestriction();
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
    this.checkDemoRestriction();
    const data = await this.orgSvc.createOrganisation(name);
    await this.linkTenantToOrganisation(this.tenant().id, data);
    return data;
  }

  async linkTenantToOrganisation(tenantId: number, organisation: Organisation): Promise<void> {
    this.checkDemoRestriction();
    await this.orgSvc.linkTenantToOrganisation(tenantId, organisation);
    this.organisation.set(organisation);
  }

  async unlinkTenantFromOrganisation(orgId: number): Promise<void> {
    this.checkDemoRestriction();
    await this.orgSvc.unlinkTenantFromOrganisation(this.tenant().id, orgId);
  }

  async getOrganisationFromTenant(): Promise<Organisation | null> {
    return this.orgSvc.getOrganisationFromTenant(this.tenant().id);
  }

  async getInstancesOfOrganisations(orgId: number): Promise<Tenant[]> {
    return this.orgSvc.getInstancesOfOrganisation(orgId);
  }

  async getAllPersonsFromOrganisation(tenants: Tenant[]): Promise<Player[]> {
    return this.orgSvc.getAllPersonsFromOrganisation(tenants);
  }

  async getOrganisationsFromUser(): Promise<Organisation[]> {
    return this.orgSvc.getOrganisationsFromUser(this.tenantUser().userId);
  }

  async getTenantsFromOrganisation(): Promise<Tenant[]> {
    return this.orgSvc.getTenantsFromOrganisation(this.tenant().id);
  }

  async handoverPersons(persons: Player[], targetTenant: Tenant, groupMapping: { [key: number]: number } = {}, stayInInstance: boolean, mainGroup: number | null): Promise<Player[]> {
    this.checkDemoRestriction();
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
    return this.attTypeSvc.getAttendanceTypes(tenantId || this.tenant().id);
  }

  async getAttendanceType(id: string): Promise<AttendanceType> {
    return this.attTypeSvc.getAttendanceType(id);
  }

  async updateAttendanceType(id: string, attType: Partial<AttendanceType>): Promise<AttendanceType> {
    this.checkDemoRestriction();
    const data = await this.attTypeSvc.updateAttendanceType(id, attType);
    this.attendanceTypes.set(await this.getAttendanceTypes());
    return data;
  }

  async addAttendanceType(attType: AttendanceType): Promise<AttendanceType> {
    this.checkDemoRestriction();
    const data = await this.attTypeSvc.addAttendanceType(attType);
    this.attendanceTypes.set(await this.getAttendanceTypes());
    return data;
  }

  async deleteAttendanceType(id: string): Promise<void> {
    this.checkDemoRestriction();
    await this.attTypeSvc.deleteAttendanceType(id);
    this.attendanceTypes.set(await this.getAttendanceTypes());
  }

  async getTenantBySongSharingId(sharingId: string): Promise<Tenant | null> {
    return this.tenantSvc.getTenantBySongSharingId(sharingId);
  }

  async getTenantByRegisterId(registerId: string): Promise<Tenant | null> {
    return this.tenantSvc.getTenantByRegisterId(registerId);
  }

  async loadShifts(): Promise<void> {
    const data = await this.shiftSvc.loadShifts(this.tenant().id);
    this.shifts.set(data);
  }

  async isShiftUsed(id: string): Promise<boolean> {
    return this.shiftSvc.isShiftUsed(id);
  }

  async addShift(shift: ShiftPlan): Promise<ShiftPlan> {
    this.checkDemoRestriction();
    const result = await this.shiftSvc.addShift(shift, this.tenant().id);
    await this.loadShifts();
    return this.shifts().find(s => s.name === shift.name);
  }

  async addShiftToTenant(shift: ShiftPlan, tenantId: number): Promise<string> {
    this.checkDemoRestriction();
    return await this.shiftSvc.addShift(shift, tenantId);
  }

  async getPlayersWithShift(tenantId: number, shiftId: string): Promise<{ id: number; appId: string; shift_name: string; shift_start: string }[]> {
    return await this.shiftSvc.getPlayersWithShift(tenantId, shiftId);
  }

  async assignShiftToPlayersInTenant(
    targetTenantId: number,
    newShiftId: string,
    appIds: string[],
    shiftData: { appId: string; shift_name: string; shift_start: string }[]
  ): Promise<{ assignedCount: number; assignedPlayerIds: number[]; playerAppIdMap: { id: number; appId: string }[] }> {
    this.checkDemoRestriction();
    return await this.shiftSvc.assignShiftToPlayersInTenant(targetTenantId, newShiftId, appIds, shiftData);
  }

  async updateShiftAttendancesInTenant(
    targetTenantId: number,
    shift: ShiftPlan,
    assignedPlayerIds: number[],
    shiftData: { appId: string; shift_name: string; shift_start: string }[],
    playerAppIdMap: { id: number; appId: string }[]
  ): Promise<void> {
    return await this.shiftSvc.updateShiftAttendancesInTenant(
      targetTenantId,
      shift,
      assignedPlayerIds,
      shiftData,
      playerAppIdMap
    );
  }

  async updateShift(shift: ShiftPlan): Promise<ShiftPlan> {
    this.checkDemoRestriction();
    await this.shiftSvc.updateShift(shift);
    await this.loadShifts();
    return;
  }

  async deleteShift(id: string): Promise<void> {
    this.checkDemoRestriction();
    await this.shiftSvc.deleteShift(id);
    await this.loadShifts();
  }

  async getChurches(): Promise<Church[]> {
    return this.churchSvc.getChurches();
  }

  async createChurch(name: string): Promise<string> {
    this.checkDemoRestriction();
    const id = await this.churchSvc.createChurch(name, this.user?.id);
    this.churches.set(await this.getChurches());
    return id;
  }

  async sendQuestion(message: string, phone: string): Promise<void> {
    return this.feedbackSvc.sendQuestion(message, phone, this.tenant().id, this.user?.id);
  }

  async sendFeedback(message: string, rating: number, anonymous: boolean, phone: string): Promise<void> {
    return this.feedbackSvc.sendFeedback(message, rating, anonymous, phone, anonymous ? null : this.tenant().id, anonymous ? null : this.user?.id);
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
