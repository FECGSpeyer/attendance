import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Church } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class ChurchService {

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

  async updateChurch(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from('churches')
      .update({ name })
      .match({ id });

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren der Gemeinde", "danger");
      throw error;
    }
  }

  async createChurch(name: string, userId?: string): Promise<string> {
    const { data, error } = await supabase
      .from('churches')
      .insert({
        name,
        created_from: userId ?? null,
      })
      .select('id')
      .single();

    if (error) {
      Utils.showToast("Fehler beim Erstellen der Kirche", "danger");
      throw error;
    }

    return data.id;
  }

  /**
   * Merge duplicate church into target: update all players cross-tenant, then delete the duplicate.
   */
  async mergeChurches(targetId: string, duplicateId: string): Promise<number> {
    // Find all players that reference the duplicate church
    const { data: players, error: fetchError } = await supabase
      .from('player')
      .select('id, additional_fields')
      .not('additional_fields', 'is', null);

    if (fetchError) throw new Error('Fehler beim Laden der Spieler');

    let updatedCount = 0;

    for (const player of (players || [])) {
      const fields = player.additional_fields as Record<string, any>;
      if (fields?.bfecg_church === duplicateId) {
        fields.bfecg_church = targetId;
        const { error: updateError } = await supabase
          .from('player')
          .update({ additional_fields: fields })
          .match({ id: player.id });

        if (!updateError) updatedCount++;
      }
    }

    // Delete the duplicate church
    const { error: deleteError } = await supabase
      .from('churches')
      .delete()
      .match({ id: duplicateId });

    if (deleteError) throw new Error('Fehler beim Löschen der Gemeinde');

    return updatedCount;
  }
}
