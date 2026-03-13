import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { TenantRolePermission } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class RolePermissionService {

  async getPermissions(tenantId: number): Promise<TenantRolePermission[]> {
    const { data, error } = await supabase
      .from('tenant_role_permissions')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Rollenberechtigungen", "danger");
      throw error;
    }

    return data as unknown as TenantRolePermission[];
  }

  async updatePermission(id: number, updates: Partial<TenantRolePermission>): Promise<TenantRolePermission> {
    const { data, error } = await supabase
      .from('tenant_role_permissions')
      .update(updates as any)
      .match({ id })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren der Rollenberechtigung", "danger");
      throw error;
    }

    return data as unknown as TenantRolePermission;
  }
}
