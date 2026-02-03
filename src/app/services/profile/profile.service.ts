import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Player } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {

  async getPlayerProfile(tenantId: number, userId: string): Promise<Player | null> {
    const { data: player, error } = await supabase
      .from('player')
      .select('*')
      .eq('tenantId', tenantId)
      .match({ appId: userId })
      .single();

    if (error) {
      return null;
    }

    return {
      ...player,
      history: player.history as any,
    } as any;
  }

  async getPlayerByAppId(tenantId: number, userId: string, showToast: boolean = true): Promise<Player> {
    const { data: player, error } = await supabase
      .from('player')
      .select('*')
      .eq('tenantId', tenantId)
      .match({ appId: userId })
      .single();

    if (error) {
      if (showToast) {
        Utils.showToast("Es konnte kein Spieler gefunden werden.", "danger");
      }
      throw error;
    }

    return {
      ...player,
      history: player.history as any,
    } as any;
  }

  async updateProfile(updates: Partial<Player>, userId: string, churchId?: string): Promise<void> {
    const { error } = await supabase
      .from('player')
      .update(updates as any)
      .match({ appId: userId });

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren des Profils", "danger");
      throw error;
    }

    if (churchId) {
      const { data: players } = await supabase
        .from('player')
        .select('*')
        .eq('appId', userId);

      if (players && players.length > 0) {
        for (const player of players) {
          const additional_fields: any = player.additional_fields || {};
          if (additional_fields?.bfecg_church && additional_fields.bfecg_church !== churchId) {
            additional_fields.bfecg_church = churchId;
            const { error: updateError } = await supabase
              .from('player')
              .update({ additional_fields })
              .match({ id: player.id });

            if (updateError) {
              Utils.showToast("Fehler beim Aktualisieren der Kirchenzuordnung", "danger");
              throw updateError;
            }
          }
        }
      }
    }
  }

  async changePassword(password: string): Promise<void> {
    await supabase.auth.updateUser({ password });
  }

  async updatePassword(password: string): Promise<void> {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const { data, error } = await supabase.auth.updateUser({ password });

    loading.dismiss();

    if (data) {
      Utils.showToast('Passwort wurde erfolgreich aktualisiert', 'success');
    }
    if (error) {
      Utils.showToast('Fehler beim zurücksetzen, versuche es noch einmal', "danger");
    }
  }
}
