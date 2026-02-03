import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { AttendanceType } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class AttendanceTypeService {

  async getAttendanceTypes(tenantId: number): Promise<AttendanceType[]> {
    const { data, error } = await supabase
      .from('attendance_types')
      .select('*')
      .eq('tenant_id', tenantId)
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
}
