import { Injectable } from '@angular/core';
import dayjs from 'dayjs';
import { supabase } from '../base/supabase';
import { AttendanceStatus } from '../../utilities/constants';
import { Attendance, AttendanceType, PersonAttendance, PersonUnavailability } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { dutyRequired, isCancelled, matchingUnavailability, occupiedCount, occupiesDuty, unavailabilityNote } from '../../utilities/duty';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase;

export type DutyTakeResult = 'ok' | 'full' | 'not_member' | 'not_allowed' | 'past';

export type DutyNotifyType = 'assigned' | 'understaffed' | 'filled';

/** An upcoming duty Termin with its persons, for "Offene Dienste" and the distribution. */
export interface DutyTermin {
  attendance: Attendance;
  type: AttendanceType;
  required: number;
  occupied: number;
  persons: PersonAttendance[];
}

@Injectable({
  providedIn: 'root'
})
export class DutyService {

  /** Leadership assigns persons; they get a push and have to confirm. */
  async assign(personAttendanceIds: string[], attendanceId: number, tenantId: number, userId: string): Promise<void> {
    if (!personAttendanceIds.length) return;
    const { error } = await db
      .from('person_attendances')
      .update({
        duty_state: 'requested',
        status: AttendanceStatus.Neutral,
        notes: '',
        duty_assigned_by: userId,
        duty_assigned_at: new Date().toISOString(),
        duty_reminder_sent: false,
        changed_by: userId,
        changed_at: new Date().toISOString(),
      })
      .in('id', personAttendanceIds);

    if (error) {
      Utils.showToast('Fehler beim Einteilen', 'danger');
      throw error;
    }

    await this.notify({ type: 'assigned', tenantId, attendanceId, personAttendanceIds });
  }

  /** Removes an assignment; the person is a stand-in again. */
  async unassign(personAttendanceId: string, userId: string): Promise<void> {
    const { error } = await db
      .from('person_attendances')
      .update({
        duty_state: null,
        status: AttendanceStatus.Neutral,
        notes: '',
        duty_assigned_by: null,
        duty_assigned_at: null,
        changed_by: userId,
        changed_at: new Date().toISOString(),
      })
      .eq('id', personAttendanceId);

    if (error) {
      Utils.showToast('Fehler beim Austragen', 'danger');
      throw error;
    }
  }

  /** The assigned person confirms the duty. */
  async confirm(personAttendanceId: string, userId: string): Promise<void> {
    const { error } = await db
      .from('person_attendances')
      .update({
        duty_state: 'confirmed',
        status: AttendanceStatus.Present,
        notes: '',
        changed_by: userId,
        changed_at: new Date().toISOString(),
      })
      .eq('id', personAttendanceId);

    if (error) {
      Utils.showToast('Fehler beim Bestätigen', 'danger');
      throw error;
    }
  }

  /** "Ich übernehme" / "Ich springe ein": atomic on the server, first one wins. */
  async take(attendanceId: number, tenantId: number): Promise<DutyTakeResult> {
    const { data, error } = await db.rpc('duty_take', { p_attendance_id: attendanceId });
    if (error) {
      Utils.showToast('Fehler beim Eintragen', 'danger');
      throw error;
    }
    const result = data as DutyTakeResult;
    if (result === 'ok') {
      void this.notify({ type: 'filled', tenantId, attendanceId });
    }
    return result;
  }

  /** Tells the edge function to inform the group (understaffed) or the assigned persons. */
  async notify(body: { type: DutyNotifyType; tenantId: number; attendanceId: number; personAttendanceIds?: string[] }): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('duty-notify', { body });
      if (error) console.error('duty-notify error', error);
    } catch (e) {
      console.error('duty-notify error', e);
    }
  }

  /** Upcoming Termine of duty types (with all persons), oldest first. */
  async getUpcomingDutyTermine(tenantId: number, types: AttendanceType[], until?: string, from?: string): Promise<DutyTermin[]> {
    const dutyTypes = types.filter(t => t.duty_mode);
    if (!dutyTypes.length) return [];

    let query = db
      .from('attendance')
      .select('*, persons:person_attendances(id, person_id, status, notes, duty_state, duty_assigned_at, person:person_id(firstName, lastName, img, appId))')
      .eq('tenantId', tenantId)
      .in('type_id', dutyTypes.map(t => t.id))
      .gte('date', from ?? dayjs().startOf('day').toISOString())
      .order('date', { ascending: true });
    if (until) {
      query = query.lte('date', until);
    }
    const { data, error } = await query;
    if (error) {
      console.error('getUpcomingDutyTermine error', error);
      return [];
    }

    return (data ?? []).map((att: any): DutyTermin => {
      const type = dutyTypes.find(t => t.id === att.type_id);
      const persons = (att.persons ?? []) as PersonAttendance[];
      return {
        attendance: att,
        type,
        required: dutyRequired(att, type),
        occupied: occupiedCount(persons),
        persons,
      };
    });
  }

  /** Duties the person could take: in the Termin, not assigned, not cancelled, not full. */
  async getOpenDutiesForPerson(tenantId: number, types: AttendanceType[], personId: number): Promise<DutyTermin[]> {
    const termine = await this.getUpcomingDutyTermine(tenantId, types.filter(t => t.duty_self_signup !== false));
    return termine.filter(t => {
      const own = t.persons.find(p => p.person_id === personId);
      return !!own && !own.duty_state && !isCancelled(own) && t.occupied < t.required;
    });
  }

  /**
   * Number of duties per person (assigned and not cancelled) between from and
   * to, optionally only for some types. Used for fair assignment.
   */
  async getDutyCounts(personIds: number[], from: string, to: string, typeIds?: string[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (!personIds.length) return counts;

    let query = db
      .from('person_attendances')
      .select('person_id, status, duty_state, attendance:attendance_id!inner(date, type_id)')
      .in('person_id', personIds)
      .not('duty_state', 'is', null)
      .gte('attendance.date', from)
      .lte('attendance.date', to)
      .range(0, 9999);
    if (typeIds?.length) {
      query = query.in('attendance.type_id', typeIds);
    }
    const { data, error } = await query;
    if (error) {
      console.error('getDutyCounts error', error);
      return counts;
    }
    for (const row of (data ?? []) as any[]) {
      if (!occupiesDuty(row)) continue;
      counts.set(row.person_id, (counts.get(row.person_id) ?? 0) + 1);
    }
    return counts;
  }

  // ── Regelmäßig verhindert ──────────────────────────────────

  async getUnavailabilityForPerson(personId: number, tenantId: number): Promise<PersonUnavailability[]> {
    const { data, error } = await db
      .from('person_unavailability')
      .select('*')
      .eq('person_id', personId)
      .eq('tenant_id', tenantId)
      .order('created_at');
    if (error) {
      Utils.showToast('Fehler beim Laden der Verfügbarkeit', 'danger');
      throw error;
    }
    return (data ?? []) as PersonUnavailability[];
  }

  async getUnavailabilityForTenant(tenantId: number): Promise<PersonUnavailability[]> {
    const { data, error } = await db
      .from('person_unavailability')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) {
      // Table may not exist yet on older databases; creating Termine must still work.
      console.error('getUnavailabilityForTenant error', error);
      return [];
    }
    return (data ?? []) as PersonUnavailability[];
  }

  async saveUnavailability(rule: PersonUnavailability): Promise<PersonUnavailability> {
    const payload = {
      tenant_id: rule.tenant_id,
      person_id: rule.person_id,
      weekdays: rule.weekdays,
      type_ids: rule.type_ids ?? [],
      reason: rule.reason ?? '',
      valid_until: rule.valid_until || null,
      created_by: rule.created_by ?? null,
    };
    const query = rule.id
      ? db.from('person_unavailability').update(payload).eq('id', rule.id)
      : db.from('person_unavailability').insert(payload);
    const { data, error } = await query.select().single();
    if (error) {
      Utils.showToast('Fehler beim Speichern', 'danger');
      throw error;
    }
    return data as PersonUnavailability;
  }

  async deleteUnavailability(id: string): Promise<void> {
    const { error } = await db.from('person_unavailability').delete().eq('id', id);
    if (error) {
      Utils.showToast('Fehler beim Löschen', 'danger');
      throw error;
    }
  }

  /**
   * Sets "Entschuldigt" on already planned Termine the rule matches. Only rows
   * that still have the type's default status and no duty assignment are
   * changed, so explicit answers and assignments are kept.
   * Returns the number of changed Termine.
   */
  async applyUnavailabilityToFuture(rule: PersonUnavailability, tenantId: number, types: AttendanceType[], userId: string): Promise<number> {
    const { data, error } = await db
      .from('person_attendances')
      .select('id, status, duty_state, attendance:attendance_id!inner(date, type_id, tenantId)')
      .eq('person_id', rule.person_id)
      .eq('attendance.tenantId', tenantId)
      .gte('attendance.date', dayjs().startOf('day').toISOString());
    if (error) {
      console.error('applyUnavailabilityToFuture error', error);
      return 0;
    }

    const ids = (data ?? []).filter((row: any) => {
      const type = types.find(t => t.id === row.attendance.type_id);
      if (!type || row.duty_state) return false;
      if (row.status !== type.default_status) return false;
      if (!type.available_statuses?.includes(AttendanceStatus.Excused)) return false;
      return !!matchingUnavailability([rule], rule.person_id, row.attendance.date, row.attendance.type_id);
    }).map((row: any) => row.id);

    if (!ids.length) return 0;
    const { error: updErr } = await db
      .from('person_attendances')
      .update({
        status: AttendanceStatus.Excused,
        notes: unavailabilityNote(rule),
        changed_by: userId,
        changed_at: new Date().toISOString(),
      })
      .in('id', ids);
    if (updErr) {
      Utils.showToast('Fehler beim Übernehmen in geplante Termine', 'danger');
      throw updErr;
    }
    return ids.length;
  }

  /** Counts future Termine a rule would change (for the "auch bestehende Termine" hint). */
  async countFutureMatches(rule: PersonUnavailability, tenantId: number, types: AttendanceType[]): Promise<{ count: number; dates: string[] }> {
    const { data, error } = await db
      .from('person_attendances')
      .select('id, status, duty_state, attendance:attendance_id!inner(date, type_id, tenantId)')
      .eq('person_id', rule.person_id)
      .eq('attendance.tenantId', tenantId)
      .gte('attendance.date', dayjs().startOf('day').toISOString());
    if (error) return { count: 0, dates: [] };
    const rows = (data ?? []).filter((row: any) => {
      const type = types.find(t => t.id === row.attendance.type_id);
      if (!type || row.duty_state || row.status !== type.default_status) return false;
      if (!type.available_statuses?.includes(AttendanceStatus.Excused)) return false;
      return !!matchingUnavailability([rule], rule.person_id, row.attendance.date, row.attendance.type_id);
    });
    return { count: rows.length, dates: rows.map((r: any) => r.attendance.date).sort() };
  }
}
