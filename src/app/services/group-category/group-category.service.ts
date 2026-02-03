import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { GroupCategory } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class GroupCategoryService {

  async getGroupCategories(tenantId: number): Promise<GroupCategory[]> {
    const { data, error } = await supabase
      .from('group_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Kategorien", "danger");
      throw error;
    }

    return data;
  }

  async addGroupCategory(name: string, tenantId: number): Promise<GroupCategory> {
    const { data, error } = await supabase
      .from('group_categories')
      .insert({
        name,
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Hinzufügen der Kategorie", "danger");
      throw error;
    }

    return data;
  }

  async updateGroupCategory(id: number, name: string): Promise<GroupCategory> {
    const { data, error } = await supabase
      .from('group_categories')
      .update({ name })
      .match({ id })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren der Kategorie", "danger");
      throw error;
    }

    return data;
  }

  async deleteGroupCategory(id: number): Promise<void> {
    const { error } = await supabase
      .from('group_categories')
      .delete()
      .match({ id });

    if (error) {
      Utils.showToast("Fehler beim Löschen der Kategorie", "danger");
      throw error;
    }
  }
}
