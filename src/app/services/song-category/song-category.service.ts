import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { SongCategory } from '../../utilities/interfaces';

@Injectable({
  providedIn: 'root'
})
export class SongCategoryService {

  async getSongCategories(tenantId: number): Promise<SongCategory[]> {
    const { data } = await supabase
      .from('song_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order("index", {
        ascending: true,
      });

    return data;
  }

  async addSongCategory(category: Partial<SongCategory>, tenantId: number): Promise<SongCategory> {
    const { data, error } = await supabase
      .from('song_categories')
      .insert({
        ...category,
        tenant_id: tenantId,
      } as SongCategory)
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim hinzufügen der Werkkategorie");
    }

    return data;
  }

  async updateSongCategory(category: Partial<SongCategory>, id: string): Promise<SongCategory[]> {
    const { data } = await supabase
      .from('song_categories')
      .update(category)
      .match({ id });

    return data;
  }

  async removeSongCategory(id: string): Promise<void> {
    await supabase
      .from('song_categories')
      .delete()
      .match({ id });
  }
}
