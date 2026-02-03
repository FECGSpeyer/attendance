import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { ShiftPlan, ShiftDefinition } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

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

  async addShift(shift: ShiftPlan, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('shifts')
      .insert({
        ...shift,
        tenant_id: tenantId,
        definition: [],
        shifts: [],
      });

    if (error) {
      Utils.showToast("Fehler beim Hinzufügen der Schicht", "danger");
      throw error;
    }
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
}
