import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { PlayerAbsence } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase;

@Injectable({
  providedIn: 'root'
})
export class PlayerAbsenceService {

  async getAbsencesForPerson(personId: number, tenantId: number): Promise<PlayerAbsence[]> {
    const { data, error } = await db
      .from('player_absences')
      .select('*')
      .eq('person_id', personId)
      .eq('tenant_id', tenantId)
      .order('from_date');

    if (error) {
      Utils.showToast('Fehler beim Laden der Abwesenheiten', 'danger');
      throw error;
    }

    return (data ?? []) as PlayerAbsence[];
  }

  async getAbsencesForTenant(tenantId: number): Promise<PlayerAbsence[]> {
    const { data, error } = await db
      .from('player_absences')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) {
      Utils.showToast('Fehler beim Laden der Abwesenheiten', 'danger');
      throw error;
    }

    return (data ?? []) as PlayerAbsence[];
  }

  async addAbsence(absence: PlayerAbsence): Promise<PlayerAbsence> {
    const { data, error } = await db
      .from('player_absences')
      .insert(absence)
      .select()
      .single();

    if (error) {
      Utils.showToast('Fehler beim Speichern der Abwesenheit', 'danger');
      throw error;
    }

    return data as PlayerAbsence;
  }

  async deleteAbsence(id: string): Promise<void> {
    const { error } = await db
      .from('player_absences')
      .delete()
      .eq('id', id);

    if (error) {
      Utils.showToast('Fehler beim Löschen der Abwesenheit', 'danger');
      throw error;
    }
  }
}
