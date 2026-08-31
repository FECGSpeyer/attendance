import { Injectable, inject } from '@angular/core';
import { Network } from '@capacitor/network';
import { Storage } from '@ionic/storage-angular';
import { supabase } from '../base/supabase';
import { GroupCategory } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class GroupCategoryService {

  private storage = inject(Storage);

  async getGroupCategories(tenantId: number): Promise<GroupCategory[]> {
    const cacheKey = `offline_group_categories_v1_${tenantId}`;
    const { connected } = await Network.getStatus();

    if (!connected) {
      const cached = await this.storage.get(cacheKey);
      return (cached ?? []) as GroupCategory[];
    }

    const { data, error } = await supabase
      .from('group_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    if (error) {
      Utils.showToast('Fehler beim Laden der Kategorien', 'danger');
      throw error;
    }

    void this.storage.set(cacheKey, data);
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
      Utils.showToast('Fehler beim Hinzufügen der Kategorie', 'danger');
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
      Utils.showToast('Fehler beim Aktualisieren der Kategorie', 'danger');
      throw error;
    }

    return data;
  }

  async updateGroupCategorySortOrder(id: number, sortOrder: number): Promise<GroupCategory> {
    const { data, error } = await supabase
      .from('group_categories')
      .update({ sort_order: sortOrder })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      Utils.showToast('Fehler beim Aktualisieren der Kategoriereihenfolge', 'danger');
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
      Utils.showToast('Fehler beim Löschen der Kategorie', 'danger');
      throw error;
    }
  }
}
