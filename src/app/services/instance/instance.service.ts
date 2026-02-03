import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Tenant } from '../../utilities/interfaces';
import { Role } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class InstanceService {

  async deleteInstance(tenantId: number): Promise<void> {
    const { error } = await supabase
      .from("tenants")
      .delete()
      .match({ id: tenantId });

    if (error) {
      Utils.showToast("Fehler beim Löschen der Instanz, bitte versuche es später erneut.", "danger");
      throw new Error(error.message);
    }

    Utils.showToast("Instanz wurde erfolgreich gelöscht!");
  }

  async createInstance(tenant: Tenant, userId: string, userEmail: string): Promise<Tenant> {
    const { data, error } = await supabase
      .from("tenants")
      .insert(tenant as any)
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Erstellen der Instanz, bitte versuche es später erneut.", "danger");
      throw new Error(error.message);
    }

    const usersToAdd = [{
      userId: "665fe2b4-d53f-4f17-a66b-46c0949af99a",
      role: Role.ADMIN,
      tenantId: data.id,
      email: "developer@attendix.de"
    }];

    if (userEmail !== "developer@attendix.de") {
      usersToAdd.push({
        userId,
        role: Role.ADMIN,
        tenantId: data.id,
        email: userEmail,
      });
    }

    const { error: userError } = await supabase
      .from("tenantUsers")
      .insert(usersToAdd);

    if (userError) {
      Utils.showToast("Fehler beim Erstellen des Benutzers, bitte versuche es später erneut.", "danger");
      throw new Error(userError.message);
    }

    Utils.showToast("Instanz wurde erfolgreich erstellt!");

    return data as unknown as Tenant;
  }

  async getTenantBySongSharingId(sharingId: string): Promise<Tenant | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('song_sharing_id', sharingId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      Utils.showToast("Fehler beim Laden des Tenants", "danger");
      throw error;
    }

    return data as unknown as Tenant;
  }

  async getTenantByRegisterId(registerId: string): Promise<Tenant | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('register_id', registerId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      Utils.showToast("Fehler beim Laden des Tenants", "danger");
      throw error;
    }

    return data as unknown as Tenant;
  }
}
