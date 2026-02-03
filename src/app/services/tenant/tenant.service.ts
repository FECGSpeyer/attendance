import { Injectable } from '@angular/core';
import { Role, SupabaseTable } from '../../utilities/constants';
import { Admin, Group, Organisation, Parent, Tenant, TenantUser, Viewer } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { supabase } from '../base/supabase';

@Injectable({
  providedIn: 'root'
})
export class TenantService {

  constructor() {}

  async getTenants(tenantUserIds: number[]): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .in('id', tenantUserIds)
      .order('longName', { ascending: true });

    if (error) {
      throw new Error("Fehler beim Laden der Tenants");
    }

    return data as unknown as Tenant[];
  }

  async getTenantById(id: number): Promise<Tenant> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error("Fehler beim Laden des Tenants");
    }

    return data as unknown as Tenant;
  }

  async updateTenantData(tenant: Partial<Tenant>, tenantId: number): Promise<Tenant> {
    delete tenant.favorite;
    const { data, error } = await supabase
      .from('tenants')
      .update(tenant as any)
      .match({ id: tenantId })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Aktualisieren der Einstellungen", "danger");
      throw new Error("Fehler beim Aktualisieren der Mandantendaten");
    }

    return data as unknown as Tenant;
  }

  async getTenantsByUserId(userId: string): Promise<TenantUser[]> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .eq('userId', userId);

    if (error) {
      throw new Error("Fehler beim Laden der Mandanten");
    }

    return data;
  }

  async getTenantUserById(tenantId: number, userId: string): Promise<TenantUser> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .match({ tenantId, userId })
      .single();

    if (error) {
      throw new Error("Fehler beim Laden des Mandanten");
    }

    return data;
  }

  async addUserToTenant(userId: string, role: Role, email: string, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('tenantUsers')
      .insert({ userId, role, tenantId, email });

    if (error) {
      throw new Error('Fehler beim Hinzufügen des Benutzers zum Mandanten');
    }
  }

  async updateTenantUser(updates: Partial<TenantUser>, userId: string, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('tenantUsers')
      .update(updates)
      .match({ userId, tenantId });

    if (error) {
      throw new Error('Fehler beim Aktualisieren des Mandantenbenutzers');
    }
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
      return; // Don't remove admin users
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

  async setFavorite(tenantId: number, userId: string, favorite: boolean): Promise<void> {
    await supabase
      .from('tenantUsers')
      .update({ favorite })
      .match({ tenantId, userId });
  }

  async getRoleFromTenantUser(appId: string, tenantId: number): Promise<Role> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('role')
      .eq('userId', appId)
      .eq('tenantId', tenantId)
      .single();

    if (error) {
      throw new Error("Fehler beim Laden der Rolle");
    }

    return data.role as Role;
  }

  // Viewers
  async getViewers(tenantId: number): Promise<Viewer[]> {
    const { data, error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .select('*')
      .eq('tenantId', tenantId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Beobachter", "danger");
      throw error;
    }

    return data;
  }

  async createViewer(viewer: Partial<Viewer>, tenantId: number, appId: string): Promise<void> {
    const { error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .insert({ ...viewer, tenantId, appId });

    if (error) {
      throw new Error("Fehler beim hinzufügen des Beobachters.");
    }
  }

  async deleteViewer(viewer: Viewer): Promise<void> {
    const { error } = await supabase
      .from(SupabaseTable.VIEWERS)
      .delete()
      .match({ id: viewer.id });

    if (error) {
      Utils.showToast("Fehler beim Löschen des Beobachters", "danger");
      throw error;
    }
  }

  // Parents
  async getParents(tenantId: number): Promise<Parent[]> {
    const { data, error } = await supabase
      .from("parents")
      .select('*')
      .eq('tenantId', tenantId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Elternteile", "danger");
      throw error;
    }

    return data;
  }

  async createParent(parent: Partial<Parent>, tenantId: number, appId: string): Promise<Parent> {
    const { error, data } = await supabase
      .from("parents")
      .insert({ ...parent, tenantId, appId })
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim hinzufügen des Elternteils.");
    }

    return data;
  }

  async deleteParent(parent: Parent): Promise<void> {
    const { error } = await supabase
      .from("parents")
      .delete()
      .match({ id: parent.id });

    if (error) {
      Utils.showToast("Fehler beim Löschen des Elternteils", "danger");
      throw error;
    }
  }

  // Organisation
  async getOrganisationForTenant(tenantId: number): Promise<Organisation | null> {
    const { data, error } = await (supabase as any)
      .from('organisations')
      .select('*, tenants:tenants(*)')
      .contains('tenantIds', [tenantId])
      .single();

    if (error) {
      return null;
    }

    return data as Organisation;
  }

  async createOrganisation(name: string, tenantId: number, userId: string): Promise<Organisation> {
    const { data, error } = await (supabase as any)
      .from('organisations')
      .insert({ name, tenantIds: [tenantId], owner: userId })
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim Erstellen der Organisation");
    }

    return data as Organisation;
  }

  async linkTenantToOrganisation(tenantId: number, organisationId: number): Promise<void> {
    const { data: org } = await (supabase as any)
      .from('organisations')
      .select('*')
      .eq('id', organisationId)
      .single();

    if (!org) {
      throw new Error("Organisation nicht gefunden");
    }

    const tenantIds = [...(org.tenantIds || []), tenantId];

    await (supabase as any)
      .from('organisations')
      .update({ tenantIds })
      .eq('id', organisationId);
  }

  async unlinkTenantFromOrganisation(tenantId: number, organisationId: number): Promise<void> {
    const { data: org } = await (supabase as any)
      .from('organisations')
      .select('*')
      .eq('id', organisationId)
      .single();

    if (!org) {
      throw new Error("Organisation nicht gefunden");
    }

    const tenantIds = (org.tenantIds || []).filter((id: number) => id !== tenantId);

    if (tenantIds.length === 0) {
      await (supabase as any).from('organisations').delete().eq('id', organisationId);
    } else {
      await (supabase as any).from('organisations').update({ tenantIds }).eq('id', organisationId);
    }
  }

  // Admin users
  async getAdminUsers(tenantId: number): Promise<Admin[]> {
    const { data } = await supabase
      .from('tenantUsers')
      .select('*')
      .eq('tenantId', tenantId)
      .eq('role', Role.ADMIN);

    return data as unknown as Admin[];
  }

  async createAdminUser(userId: string, email: string, tenantId: number): Promise<void> {
    await this.addUserToTenant(userId, Role.ADMIN, email, tenantId);
  }

  // Create new tenant
  async createTenant(tenant: Partial<Tenant>): Promise<Tenant> {
    const { data, error } = await supabase
      .from('tenants')
      .insert(tenant as any)
      .select()
      .single();

    if (error) {
      throw new Error("Fehler beim Erstellen des Mandanten");
    }

    return data as unknown as Tenant;
  }

  async deleteTenant(tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('tenants')
      .delete()
      .eq('id', tenantId);

    if (error) {
      throw new Error("Fehler beim Löschen des Mandanten");
    }
  }

  // Tenant lookup methods
  async getTenantBySongSharingId(songSharingId: string): Promise<Tenant | null> {
    const { data } = await supabase
      .from('tenants')
      .select('*')
      .eq('song_sharing_id', songSharingId)
      .single();

    return data as unknown as Tenant;
  }

  async getTenantByRegisterId(registerId: string): Promise<Tenant | null> {
    const { data } = await supabase
      .from('tenants')
      .select('*')
      .eq('register_id', registerId)
      .single();

    return data as unknown as Tenant;
  }
}
