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
}
