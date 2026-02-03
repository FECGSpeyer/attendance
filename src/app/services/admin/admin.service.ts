import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Admin, TenantUser } from '../../utilities/interfaces';
import { Role } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  async getAdmins(tenantId: number): Promise<Admin[]> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('email, userId, created_at')
      .eq('role', Role.ADMIN)
      .eq('tenantId', tenantId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Admins", "danger");
      throw error;
    }

    return data.filter((e: Admin) => Boolean(e) && e.email !== "developer@attendix.de");
  }

  async removeUserFromTenant(appId: string, tenantId: number, deleteAdmin: boolean = false): Promise<void> {
    if (deleteAdmin) {
      const { error } = await supabase
        .from('tenantUsers')
        .delete()
        .eq('tenantId', tenantId)
        .eq('role', Role.ADMIN)
        .match({ userId: appId });

      if (error) {
        throw new Error('Fehler beim Löschen des Accounts vom Mandanten');
      }
      return;
    }

    const { data } = await supabase
      .from('tenantUsers')
      .select('*')
      .eq('role', Role.ADMIN)
      .eq('userId', appId)
      .eq('tenantId', tenantId)
      .single();

    if (data) {
      return;
    }

    const { error } = await supabase
      .from('tenantUsers')
      .delete()
      .eq('tenantId', tenantId)
      .match({ userId: appId });

    if (error) {
      throw new Error('Fehler beim Löschen des Accounts vom Mandanten');
    }
  }

  async updateTenantUser(updates: Partial<TenantUser>, userId: string, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('tenantUsers')
      .update(updates)
      .match({ tenantId, userId });

    if (error) {
      throw new Error('Fehler beim Updaten des Benutzers');
    }
  }

  async getRoleFromTenantUser(appId: string, tenantId: number): Promise<Role> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('role')
      .eq('tenantId', tenantId)
      .eq('userId', appId)
      .single();

    if (error) {
      throw new Error('Fehler beim Laden der Rolle');
    }

    return data?.role;
  }

  async getTenantUserById(id: string, tenantId: number): Promise<TenantUser> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .match({ tenantId, userId: id })
      .single();

    if (error) {
      throw new Error("Fehler beim Laden des Mandanten");
    }

    return data;
  }

  async setFavoriteTenant(tenantId: number, userId: string, favorite: boolean): Promise<void> {
    const { error } = await supabase
      .from("tenantUsers")
      .update({ favorite })
      .eq("userId", userId)
      .eq("tenantId", tenantId);

    if (error) {
      Utils.showToast("Fehler beim Setzen des Favoriten, bitte versuche es später erneut.", "danger");
      throw new Error(error.message);
    }
  }
}
