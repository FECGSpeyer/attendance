import { Injectable, WritableSignal, signal } from '@angular/core';
import { supabase } from '../base/supabase';
import {
  AttendanceType,
  CrossTenantPersonAttendance,
  PersonAttendance,
  Tenant,
  TenantUser,
  Player
} from '../../utilities/interfaces';
import { AttendanceStatus, Role } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class CrossTenantService {

  public crossTenantAttendances: WritableSignal<CrossTenantPersonAttendance[]> = signal([]);
  public crossTenantAttendancesLoading: WritableSignal<boolean> = signal(false);
  private crossTenantAttendanceTypes: Map<number, AttendanceType[]> = new Map();
  private tenantColors: Map<number, string> = new Map();

  private readonly distinctColors: string[] = [
    '#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA',
    '#00ACC1', '#F4511E', '#3949AB', '#7CB342', '#C2185B',
    '#00897B', '#6D4C41', '#5E35B1', '#039BE5', '#D81B60', '#FFB300',
  ];

  private getTenantColor(tenantId: number, tenantUsers: TenantUser[]): string {
    if (this.tenantColors.has(tenantId)) {
      return this.tenantColors.get(tenantId)!;
    }
    const tenantIds = tenantUsers?.map(tu => tu.tenantId) || [];
    const index = tenantIds.indexOf(tenantId);
    const colorIndex = index >= 0 ? index % this.distinctColors.length : Math.abs(tenantId) % this.distinctColors.length;
    const color = this.distinctColors[colorIndex];
    this.tenantColors.set(tenantId, color);
    return color;
  }

  async getPersonIdForTenant(tenantId: number, userId: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('player')
      .select('id')
      .eq('tenantId', tenantId)
      .eq('appId', userId)
      .single();

    if (error || !data) {
      return null;
    }
    return data.id;
  }

  async getPersonAttendancesForTenant(
    personId: number,
    tenantId: number,
    startDate: string
  ): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('person_attendances')
      .select('*, attendance:attendance_id(id, date, type, typeInfo, songs, type_id, start_time, end_time, deadline)')
      .eq('person_id', personId)
      .gt("attendance.date", startDate);

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

  async loadAllPersonAttendancesAcrossTenants(
    userId: string,
    tenantUsers: TenantUser[],
    tenants: Tenant[],
    startDate: string,
    forceRefresh: boolean = false
  ): Promise<CrossTenantPersonAttendance[]> {
    if (!forceRefresh && this.crossTenantAttendances().length > 0) {
      return this.crossTenantAttendances();
    }

    this.crossTenantAttendancesLoading.set(true);

    try {
      if (!tenantUsers || tenantUsers.length === 0) {
        this.crossTenantAttendances.set([]);
        return [];
      }

      const tenantIds = tenantUsers.map(tu => tu.tenantId);
      this.crossTenantAttendanceTypes = await this.getAttendanceTypesForTenants(tenantIds);

      const attendanceResults = await Promise.all(
        tenantUsers.map(async (tu) => {
          const personId = await this.getPersonIdForTenant(tu.tenantId, userId);
          if (!personId) {
            return [];
          }

          const attendances = await this.getPersonAttendancesForTenant(personId, tu.tenantId, startDate);
          const tenant = tenants?.find(t => t.id === tu.tenantId);
          const tenantColor = this.getTenantColor(tu.tenantId, tenantUsers);
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

      const allAttendances = attendanceResults
        .reduce((acc, curr) => acc.concat(curr), [])
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      this.crossTenantAttendances.set(allAttendances);
      return allAttendances;
    } finally {
      this.crossTenantAttendancesLoading.set(false);
    }
  }

  getCrossTenantAttendanceType(att: CrossTenantPersonAttendance): AttendanceType | undefined {
    return this.crossTenantAttendanceTypes.get(att.tenantId)?.find(t => t.id === att.typeId);
  }

  // Person handover methods
  async getUserRolesForTenants(userId: string): Promise<{ tenantId: number; role: Role }[]> {
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

  async getTenantsFromUser(userId: string, linkedTenants: Tenant[]): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*, tenantId(*)')
      .eq('userId', userId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Mandanten", "danger");
      throw error;
    }

    return data
      .map((tu: any) => ({
        ...tu.tenantId,
        role: tu.role,
      }))
      .filter((t: Tenant) => linkedTenants.find((lt) => lt.id === t.id) && (t as any).role !== Role.VIEWER);
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

  async getPossiblePersonsByName(
    firstName: string,
    lastName: string,
    linkedTenants: Tenant[],
    onlyWithAccount: boolean = true
  ): Promise<Player[]> {
    let query = supabase
      .from('player')
      .select('*, instrument(name), tenantId(id, shortName, longName)')
      .ilike('firstName', `%${firstName.trim()}%`)
      .ilike('lastName', `%${lastName.trim()}%`)
      .is('pending', false);

    if (onlyWithAccount) {
      query = query.neq('email', null);
    }

    const { data, error } = await query;

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    return data.filter((p: any) => {
      return linkedTenants.find((lt) => lt.id === p.tenantId.id);
    }) as unknown as Player[];
  }
}
