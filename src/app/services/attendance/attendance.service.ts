import { Injectable, inject } from '@angular/core';
import dayjs from 'dayjs';
import { AttendanceStatus } from '../../utilities/constants';
import { Attendance, AttendanceType, Person, PersonAttendance } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { supabase, attendanceSelect } from '../base/supabase';
import { pickPersonAttendanceFields } from '../../utilities/db-helpers';
import { TrackingEvent, TrackingService } from '../tracking/tracking.service';

@Injectable({
  providedIn: 'root'
})
export class AttendanceService {

  private tracking = inject(TrackingService);

  constructor() {}

  getCurrentAttDate(): string {
    const attDate = localStorage.getItem('attDate');
    return attDate || dayjs().subtract(6, 'month').toISOString();
  }

  setCurrentAttDate(date: string): void {
    localStorage.setItem('attDate', date);
  }

  async addAttendance(attendance: Attendance, tenantId: number): Promise<number> {
    const { data, error } = await supabase
      .from('attendance')
      .insert({ ...attendance, tenantId } as any)
      .select()
      .single();

    if (error) {
      throw new Error('Fehler beim Hinzufügen der Anwesenheit');
    }

    return data.id;
  }

  async addPersonAttendances(personAttendances: PersonAttendance[]): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .insert(personAttendances as any);

    if (error) {
      // If it's a duplicate key error (constraint violation), ignore it silently
      // This can happen if the person is already in the attendance
      if (error.code === '23505') {
        console.warn('Duplicate person-attendance entry detected and ignored:', error.message);
        return;
      }
      throw new Error('Fehler beim Hinzufügen der Person-Anwesenheiten');
    }
  }

  async deletePersonAttendances(attendanceIds: number[], personId: number): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .delete()
      .in('attendance_id', attendanceIds)
      .eq('person_id', personId);

    if (error) {
      throw new Error('Fehler beim Löschen der Person-Anwesenheiten');
    }
  }

  async getAttendance(
    tenantId: number,
    currentAttDate: string,
    all: boolean = false,
    withPersonAttendance: boolean = false
  ): Promise<Attendance[]> {
    let res: any[];

    if (withPersonAttendance) {
      const { data } = await supabase
        .from('attendance')
        .select(`*, persons:person_attendances(
          *, person:person_id(
            firstName, lastName, img, instrument(id, name), joined
          )
        )`)
        .eq('tenantId', tenantId)
        .gt('date', all ? dayjs('2020-01-01').toISOString() : currentAttDate)
        .order('date', { ascending: false });

      res = data.map((att) => ({
        ...att,
        persons: att.persons.map((pa) => ({
          ...pa,
          firstName: (pa as any).person.firstName,
          lastName: (pa as any).person.lastName,
          img: (pa as any).person.img,
          instrument: (pa as any).person.instrument.id,
          groupName: (pa as any).person.instrument.name,
          joined: (pa as any).person.joined,
        }))
      }) as any);
    } else {
      const { data } = await supabase
        .from('attendance')
        .select('*')
        .eq('tenantId', tenantId)
        .gt('date', all ? dayjs('2020-01-01').toISOString() : currentAttDate)
        .order('date', { ascending: false });

      res = data;
    }

    return res.map((att: any): Attendance => {
      if (att.plan) {
        att.plan.time = dayjs(att.plan.time).isValid() ? dayjs(att.plan.time).format('HH:mm') : att.plan.time;
      }
      return att;
    });
  }

  async getUpcomingAttendances(tenantId: number): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('tenantId', tenantId)
      .gt('date', dayjs().startOf('day').toISOString())
      .order('date', { ascending: false });

    return data as any;
  }

  async getAttendancesByDate(date: string, tenantId: number): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('tenantId', tenantId)
      .gt('date', dayjs(date).startOf('day').toISOString())
      .order('date', { ascending: false });

    return data as any;
  }

  async getAttendanceById(id: number): Promise<Attendance> {
    const { data } = await supabase
      .from('attendance')
      .select(attendanceSelect)
      .match({ id })
      .order('date', { ascending: false })
      .single();

    return Utils.getModifiedAttendanceData(data as any);
  }

  /**
   * Cold-start-resilient version of getAttendanceById, used when the modal
   * opens via push notification. The plain join query in getAttendanceById
   * occasionally returns the parent attendance row with persons:[] on cold
   * start — embedded-resource RLS evaluates against tenantUsers via
   * auth.uid(), and during the cold-start window (token refresh, replica
   * lag, etc.) the embed silently filters to []. Two-stage strategy:
   *
   *   Stage A: bounded exponential retry of the same join, racing a
   *   one-shot TOKEN_REFRESHED listener so a refresh resumes us early.
   *   Stage B: deterministic fallback — fetch attendance + person_attendances
   *   as separate queries, combine client-side. Different RLS code path
   *   from the embed, which is what's actually failing.
   *
   * Throws when even Stage B can't load the attendance row, so the caller
   * can show a toast + close instead of rendering a silent empty modal.
   */
  async getAttendanceByIdRobust(
    id: number,
    opts: { context?: 'modal_open' | 'visibility_resume' } = {}
  ): Promise<Attendance> {
    const context = opts.context ?? 'modal_open';
    const startedAt = Date.now();
    const backoffs = [50, 150, 400, 1000];
    const maxAttempts = backoffs.length + 1; // 5 attempts total

    let lastData: any = null;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptStartedAt = Date.now();
      let outcome: 'success' | 'empty' | 'error' | 'throw' = 'error';
      let errorText: string | undefined;
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select(attendanceSelect)
          .match({ id })
          .order('date', { ascending: false })
          .single();

        if (error) {
          outcome = 'error';
          errorText = error.message;
          lastError = errorText;
        } else if (!data) {
          outcome = 'error';
          errorText = 'no row returned';
          lastError = errorText;
        } else if (!(data as any).persons || (data as any).persons.length === 0) {
          outcome = 'empty';
          lastData = data;
        } else {
          outcome = 'success';
          lastData = data;
        }
      } catch (e: any) {
        outcome = 'throw';
        errorText = e?.message ?? String(e);
        lastError = errorText;
      }

      this.tracking.track(TrackingEvent.AttendanceFetchAttempt, {
        attempt,
        stage: 'A',
        elapsed_ms: Date.now() - attemptStartedAt,
        attendance_id: id,
        context,
        outcome,
        error_text: errorText,
      });
      if (outcome !== 'success' && outcome !== 'empty') {
        console.warn(`[attendance fetch] attempt ${attempt} ${outcome}: ${errorText}`);
      }

      if (outcome === 'success') {
        this.tracking.track(TrackingEvent.AttendanceFetchResolved, {
          total_elapsed_ms: Date.now() - startedAt,
          attempts: attempt,
          stage: 'A',
          persons_count: (lastData as any).persons.length,
          attendance_id: id,
          context,
        });
        return this.safeModify(lastData, id);
      }

      if (attempt < maxAttempts) {
        await this.raceTokenRefreshOrSleep(backoffs[attempt - 1]);
      }
    }

    // Stage B — separate-query fallback. Different RLS code path from the
    // embedded-resource path, which is the actual deterministic fix.
    const stageBStartedAt = Date.now();
    const [attRes, paRes] = await Promise.all([
      supabase
        .from('attendance')
        .select('*')
        .match({ id })
        .single(),
      supabase
        .from('person_attendances')
        .select('*, person:person_id(firstName, lastName, img, instrument(id, name), joined, appId, additional_fields)')
        .eq('attendance_id', id),
    ]);

    const attendanceOk = !attRes.error && !!attRes.data;
    const persons = (paRes.data ?? []) as any[];

    this.tracking.track(TrackingEvent.AttendanceFetchStageB, {
      elapsed_ms: Date.now() - stageBStartedAt,
      attendance_id: id,
      context,
      persons_count: persons.length,
      attendance_ok: attendanceOk,
      pa_error_text: paRes.error?.message,
    });

    if (!attendanceOk) {
      this.tracking.track(TrackingEvent.AttendanceFetchResolved, {
        total_elapsed_ms: Date.now() - startedAt,
        attempts: maxAttempts,
        stage: 'B_fail',
        persons_count: 0,
        attendance_id: id,
        context,
      });
      throw new Error(
        `getAttendanceByIdRobust: failed to load attendance ${id} after ${maxAttempts} attempts + Stage B fallback (${lastError ?? attRes.error?.message ?? 'unknown'})`
      );
    }

    const combined = { ...(attRes.data as any), persons };
    this.tracking.track(TrackingEvent.AttendanceFetchResolved, {
      total_elapsed_ms: Date.now() - startedAt,
      attempts: maxAttempts,
      stage: 'B',
      persons_count: persons.length,
      attendance_id: id,
      context,
    });
    return this.safeModify(combined, id);
  }

  /**
   * Wraps Utils.getModifiedAttendanceData to survive a single bad row
   * (e.g. a player with instrument=null — the schema allows it and the
   * unwrapped util does `(person.person.instrument as any).id` which throws).
   * Filters the bad row, tracks it, then defers to the existing util so the
   * downstream shape is identical to the non-robust path.
   */
  private safeModify(data: any, attendanceId: number): Attendance {
    if (!data) return data;
    if (!Array.isArray(data.persons)) return data;
    const good: any[] = [];
    for (const person of data.persons) {
      const instrumentObj = person?.person?.instrument as any;
      if (!instrumentObj || instrumentObj.id == null) {
        this.tracking.track(TrackingEvent.AttendanceFetchModifyThrow, {
          attendance_id: attendanceId,
          person_id: person?.person_id,
          message: instrumentObj == null ? 'person.instrument is null' : 'person.instrument.id is null',
        });
        continue;
      }
      good.push(person);
    }
    data.persons = good;
    return Utils.getModifiedAttendanceData(data);
  }

  /**
   * Sleep for `ms`, but resume early if Supabase fires TOKEN_REFRESHED —
   * a refresh is the most likely event to clear the cold-start RLS race.
   */
  private raceTokenRefreshOrSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try { sub.data.subscription.unsubscribe(); } catch { /* noop */ }
        resolve();
      };
      const sub = supabase.auth.onAuthStateChange((event) => {
        if (event === 'TOKEN_REFRESHED') finish();
      });
      setTimeout(finish, ms);
    });
  }

  async updateAttendance(att: Partial<Attendance>, id: number): Promise<Attendance> {
    const { data, error } = await supabase
      .from('attendance')
      .update(att as any)
      .match({ id })
      .select()
      .single();

    if (error) {
      throw new Error('Fehler beim updaten der Anwesenheit');
    }

    return data as any;
  }

  async removeAttendance(id: number): Promise<void> {
    await supabase
      .from('attendance')
      .delete()
      .match({ id });
  }

  async getPersonAttendances(
    personId: number,
    currentAttDate: string,
    attendanceTypes: AttendanceType[],
    all: boolean = false
  ): Promise<PersonAttendance[]> {
    const { data } = await supabase
      .from('person_attendances')
      .select('*, attendance:attendance_id(id, date, type, typeInfo, songs, type_id, start_time, end_time, deadline, plan, share_plan)')
      .eq('person_id', personId)
      .gt('attendance.date', all ? dayjs('2020-01-01').toISOString() : currentAttDate) as any;

    return data.filter((a: any) => Boolean(a.attendance)).map((att: any): PersonAttendance => {
      const attText = Utils.getAttText(att);
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
        highlight: attType ? attType.highlight : att.attendance.type === 'vortrag',
      } as any;
    });
  }

  async getParentAttendances(playerIds: number[], attendanceIds: number[]): Promise<any[]> {
    const { data, error } = await supabase
      .from('person_attendances')
      .select('*, person:person_id(firstName)')
      .in('person_id', playerIds)
      .in('attendance_id', attendanceIds);

    if (error) {
      Utils.showToast('Fehler beim Laden der Anwesenheiten', 'danger');
      throw error;
    }

    return data || [];
  }

  async updatePersonAttendance(id: string, att: Partial<PersonAttendance>, userId?: string): Promise<void> {
    const dbFields = pickPersonAttendanceFields({
      ...att,
      changed_by: userId || null,
      changed_at: new Date().toISOString(),
    });
    const { error } = await supabase
      .from('person_attendances')
      .update(dbFields as any)
      .match({ id });

    if (error) {
      throw new Error('Fehler beim updaten der Anwesenheit');
    }
  }

  // Sign out helper for self-service
  async signOut(personAttendanceId: string, notes: string, status: AttendanceStatus, userId?: string): Promise<void> {
    await this.updatePersonAttendance(personAttendanceId, { notes, status }, userId);
  }

  // Sign in helper for self-service
  async signIn(personAttendanceId: string, status: AttendanceStatus, userId?: string): Promise<void> {
    await this.updatePersonAttendance(personAttendanceId, { notes: '', status }, userId);
  }

  /**
   * Delete a single person attendance by its ID
   */
  async deletePersonAttendanceById(id: string): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .delete()
      .match({ id });

    if (error) {
      throw new Error('Fehler beim Löschen der Person-Anwesenheit');
    }
  }
}
