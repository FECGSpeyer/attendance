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
  ): Promise<number> {
    if (appIds.length === 0) {
      return 0;
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
      return 0;
    }

    // Update each player with the new shift
    let assignedCount = 0;
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
      }
    }

    return assignedCount;
  }
}
