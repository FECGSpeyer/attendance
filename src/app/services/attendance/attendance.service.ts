import { Injectable } from '@angular/core';
import dayjs from 'dayjs';
import { AttendanceStatus } from '../../utilities/constants';
import { Attendance, AttendanceType, Person, PersonAttendance } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { supabase, attendanceSelect } from '../base/supabase';

@Injectable({
  providedIn: 'root'
})
export class AttendanceService {

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
      throw new Error("Fehler beim Hinzufügen der Anwesenheit");
    }

    return data.id;
  }

  async addPersonAttendances(personAttendances: PersonAttendance[]): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .insert(personAttendances as any);

    if (error) {
      throw new Error("Fehler beim Hinzufügen der Person-Anwesenheiten");
    }
  }

  async deletePersonAttendances(attendanceIds: number[], personId: number): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .delete()
      .in('attendance_id', attendanceIds)
      .eq('person_id', personId);

    if (error) {
      throw new Error("Fehler beim Löschen der Person-Anwesenheiten");
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
        .gt("date", all ? dayjs("2020-01-01").toISOString() : currentAttDate)
        .order("date", { ascending: false });

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
        .gt("date", all ? dayjs("2020-01-01").toISOString() : currentAttDate)
        .order("date", { ascending: false });

      res = data;
    }

    return res.map((att: any): Attendance => {
      if (att.plan) {
        att.plan.time = dayjs(att.plan.time).isValid() ? dayjs(att.plan.time).format("HH:mm") : att.plan.time;
      }
      return att;
    });
  }

  async getUpcomingAttendances(tenantId: number): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('tenantId', tenantId)
      .gt("date", dayjs().startOf("day").toISOString())
      .order("date", { ascending: false });

    return data as any;
  }

  async getAttendancesByDate(date: string, tenantId: number): Promise<Attendance[]> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('tenantId', tenantId)
      .gt("date", dayjs(date).startOf("day").toISOString())
      .order("date", { ascending: false });

    return data as any;
  }

  async getAttendanceById(id: number): Promise<Attendance> {
    const { data } = await supabase
      .from('attendance')
      .select(attendanceSelect)
      .match({ id })
      .order("date", { ascending: false })
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
      .gt("attendance.date", all ? dayjs("2020-01-01").toISOString() : currentAttDate) as any;

    return data.filter((a: any) => Boolean(a.attendance)).map((att: any): PersonAttendance => {
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

  async getParentAttendances(playerIds: number[], attendanceIds: number[]): Promise<any[]> {
    const { data, error } = await supabase
      .from('person_attendances')
      .select('*, person:person_id(firstName)')
      .in('person_id', playerIds)
      .in('attendance_id', attendanceIds);

    if (error) {
      Utils.showToast("Fehler beim Laden der Anwesenheiten", "danger");
      throw error;
    }

    return data || [];
  }

  async updatePersonAttendance(id: string, att: Partial<PersonAttendance>, userId?: string): Promise<void> {
    const { error } = await supabase
      .from('person_attendances')
      .update({
        ...att,
        changed_by: userId || null,
        changed_at: new Date().toISOString(),
      })
      .match({ id });

    if (error) {
      throw new Error("Fehler beim updaten der Anwesenheit");
    }
  }

  // Sign out helper for self-service
  async signOut(personAttendanceId: string, notes: string, status: AttendanceStatus, userId?: string): Promise<void> {
    await this.updatePersonAttendance(personAttendanceId, { notes, status }, userId);
  }

  // Sign in helper for self-service
  async signIn(personAttendanceId: string, status: AttendanceStatus, userId?: string): Promise<void> {
    await this.updatePersonAttendance(personAttendanceId, { notes: "", status }, userId);
  }
}
