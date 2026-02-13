import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { ShiftPlan, ShiftDefinition, AttendanceType, PersonAttendance } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { AttendanceStatus } from '../../utilities/constants';
import dayjs from 'dayjs';

@Injectable({
  providedIn: 'root'
})
export class ShiftService {

  async loadShifts(tenantId: number): Promise<ShiftPlan[]> {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Schichten", "danger");
      throw error;
    }

    return (data as any).map((shift: ShiftPlan) => {
      return {
        ...shift,
        definition: (shift.definition || []).sort((a: ShiftDefinition, b: ShiftDefinition) => {
          return a.index - b.index;
        }),
      }
    });
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

  async addShift(shift: ShiftPlan, tenantId: number): Promise<string> {
    const { data, error } = await supabase
      .from('shifts')
      .insert({
        name: shift.name,
        description: shift.description,
        tenant_id: tenantId,
        definition: (shift.definition || []) as any,
        shifts: (shift.shifts || []) as any,
      })
      .select('id')
      .single();

    if (error) {
      Utils.showToast("Fehler beim Hinzufügen der Schicht", "danger");
      throw error;
    }

    return data.id;
  }

  async updateShift(shift: ShiftPlan): Promise<void> {
    const { error } = await supabase
      .from('shifts')
      .update(shift as any)
      .match({ id: shift.id });

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren der Schicht", "danger");
      throw error;
    }
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
  }

  async getPlayersWithShift(tenantId: number, shiftId: string): Promise<{ id: number; appId: string; shift_name: string; shift_start: string }[]> {
    const { data, error } = await supabase
      .from('player')
      .select('id, appId, shift_name, shift_start')
      .eq('tenantId', tenantId)
      .eq('shift_id', shiftId)
      .not('appId', 'is', null);

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen mit Schicht", "danger");
      throw error;
    }

    return data as { id: number; appId: string; shift_name: string; shift_start: string }[];
  }

  async assignShiftToPlayersInTenant(
    targetTenantId: number,
    newShiftId: string,
    appIds: string[],
    shiftData: { appId: string; shift_name: string; shift_start: string }[]
  ): Promise<{ assignedCount: number; assignedPlayerIds: number[]; playerAppIdMap: { id: number; appId: string }[] }> {
    if (appIds.length === 0) {
      return { assignedCount: 0, assignedPlayerIds: [], playerAppIdMap: [] };
    }

    // Get players in target tenant that have matching appIds
    const { data: targetPlayers, error: fetchError } = await supabase
      .from('player')
      .select('id, appId')
      .eq('tenantId', targetTenantId)
      .in('appId', appIds)
      .is('left', null);

    if (fetchError) {
      Utils.showToast("Fehler beim Suchen der Personen in Ziel-Instanz", "danger");
      throw fetchError;
    }

    if (!targetPlayers || targetPlayers.length === 0) {
      return { assignedCount: 0, assignedPlayerIds: [], playerAppIdMap: [] };
    }

    // Update each player with the new shift
    let assignedCount = 0;
    const assignedPlayerIds: number[] = [];
    const playerAppIdMap: { id: number; appId: string }[] = [];

    for (const player of targetPlayers) {
      const originalData = shiftData.find(sd => sd.appId === player.appId);
      const { error: updateError } = await supabase
        .from('player')
        .update({
          shift_id: newShiftId,
          shift_name: originalData?.shift_name || null,
          shift_start: originalData?.shift_start || null,
        })
        .eq('id', player.id);

      if (!updateError) {
        assignedCount++;
        assignedPlayerIds.push(player.id);
        playerAppIdMap.push({ id: player.id, appId: player.appId });
      }
    }

    return { assignedCount, assignedPlayerIds, playerAppIdMap };
  }

  async updateShiftAttendancesInTenant(
    targetTenantId: number,
    shift: ShiftPlan,
    assignedPlayerIds: number[],
    shiftData: { appId: string; shift_name: string; shift_start: string }[],
    playerAppIdMap: { id: number; appId: string }[]
  ): Promise<void> {
    if (assignedPlayerIds.length === 0) {
      return;
    }

    // Get attendance types for target tenant
    const { data: attendanceTypes, error: typesError } = await supabase
      .from('attendance_types')
      .select('*')
      .eq('tenant_id', targetTenantId);

    if (typesError || !attendanceTypes) {
      console.error('Error loading attendance types:', typesError);
      return;
    }

    const types = attendanceTypes as unknown as AttendanceType[];

    // Get upcoming attendances for target tenant
    const { data: upcomingAttendances, error: attError } = await supabase
      .from('attendance')
      .select('id, date, type_id, start_time, end_time')
      .eq('tenantId', targetTenantId)
      .gt('date', dayjs().startOf('day').toISOString());

    if (attError || !upcomingAttendances || upcomingAttendances.length === 0) {
      return;
    }

    const attendanceIds = upcomingAttendances.map(a => a.id);

    // Get person attendances for assigned players
    const { data: personAttendances, error: paError } = await supabase
      .from('person_attendances')
      .select('id, person_id, attendance_id, status, notes')
      .in('person_id', assignedPlayerIds)
      .in('attendance_id', attendanceIds);

    if (paError || !personAttendances) {
      console.error('Error loading person attendances:', paError);
      return;
    }

    // Update each person attendance based on shift
    for (const pa of personAttendances) {
      const attendance = upcomingAttendances.find(a => a.id === pa.attendance_id);
      if (!attendance) continue;

      const attType = types.find(t => t.id === attendance.type_id);
      if (!attType || attType.all_day) continue;

      // Get shift data for this player
      const playerMapping = playerAppIdMap.find(p => p.id === pa.person_id);
      if (!playerMapping) continue;

      const playerShiftData = shiftData.find(sd => sd.appId === playerMapping.appId);
      if (!playerShiftData) continue;

      const result = Utils.getStatusByShift(
        shift,
        attendance.date,
        attendance.start_time ?? attType.start_time,
        attendance.end_time ?? attType.end_time,
        attType.default_status,
        playerShiftData.shift_start,
        playerShiftData.shift_name
      );

      if (result.status === AttendanceStatus.Excused && pa.status === attType.default_status) {
        await supabase
          .from('person_attendances')
          .update({
            status: result.status,
            notes: result.note,
          })
          .eq('id', pa.id);
      }
    }
  }
}
