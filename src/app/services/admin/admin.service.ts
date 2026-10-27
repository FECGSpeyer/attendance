import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Admin, TenantUser } from '../../utilities/interfaces';
import { Role, SUPER_DEVELOPER_EMAIL } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';
import { translate } from '@jsverse/transloco';

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
      Utils.showToast(translate('svc.loadAdminsFailed'), 'danger');
      throw error;
    }

    return data.filter((e: Admin) => Boolean(e) && e.email !== SUPER_DEVELOPER_EMAIL);
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
        throw new Error(translate('db.removeFromTenantFailed'));
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
      throw new Error(translate('db.removeFromTenantFailed'));
    }
  }

  async updateTenantUser(updates: Partial<TenantUser>, userId: string, tenantId: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { telegram_chat_id, ...dbUpdates } = updates as any;
    const { error } = await supabase
      .from('tenantUsers')
      .update(dbUpdates as any)
      .match({ tenantId, userId });

    if (error) {
      throw new Error(translate('db.updateUserFailed'));
    }
  }

  async getRoleFromTenantUser(appId: string, tenantId: number): Promise<Role> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('role')
      .eq('tenantId', tenantId)
      .eq('userId', appId)
      .maybeSingle();

    if (error) {
      throw new Error(translate('db.loadRoleFailed'));
    }

    return data?.role ?? Role.NONE;
  }

  async getTenantUserById(id: string, tenantId: number): Promise<TenantUser> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .match({ tenantId, userId: id })
      .single();

    if (error) {
      throw new Error(translate('svc.loadTenantFailed'));
    }

    return data;
  }

  async setFavoriteTenant(tenantId: number, userId: string, favorite: boolean): Promise<void> {
    const { error } = await supabase
      .from('tenantUsers')
      .update({ favorite })
      .eq('userId', userId)
      .eq('tenantId', tenantId);

    if (error) {
      Utils.showToast(translate('db.favoriteFailed'), 'danger');
      throw new Error(error.message);
    }
  }
}
