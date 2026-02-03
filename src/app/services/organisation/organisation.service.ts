import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { Organisation, Tenant, Player } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class OrganisationService {

  async createOrganisation(name: string): Promise<Organisation> {
    const { data, error } = await supabase
      .from('tenant_groups')
      .insert({ name })
      .select()
      .single();

    if (error) {
      Utils.showToast("Fehler beim Erstellen der Organisation", "danger");
      throw error;
    }

    return data;
  }

  async linkTenantToOrganisation(tenantId: number, organisation: Organisation): Promise<void> {
    const { error } = await supabase
      .from('tenant_group_tenants')
      .insert({
        tenant_id: tenantId,
        tenant_group: organisation.id,
      });

    if (error) {
      Utils.showToast("Fehler beim Verknüpfen der Organisation", "danger");
      throw error;
    }
  }

  async unlinkTenantFromOrganisation(tenantId: number, orgId: number): Promise<void> {
    const { error } = await supabase
      .from('tenant_group_tenants')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('tenant_group', orgId);

    if (error) {
      Utils.showToast("Fehler beim Entfernen der Organisation", "danger");
      throw error;
    }

    // check if there are still tenants in the organisation if not delete the organisation
    const { data, error: fetchError } = await supabase
      .from('tenant_group_tenants')
      .select('*')
      .eq('tenant_group', orgId);

    if (fetchError) {
      Utils.showToast("Fehler beim Entfernen der Organisation", "danger");
      throw fetchError;
    }

    if (data.length === 0) {
      await supabase
        .from('tenant_groups')
        .delete()
        .match({ id: orgId });
    }
  }

  async getOrganisationFromTenant(tenantId: number): Promise<Organisation | null> {
    const { data, error } = await supabase
      .from('tenant_group_tenants')
      .select('*, tenant_group_data:tenant_group(*)')
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      Utils.showToast("Fehler beim Laden der Organisation", "danger");
      throw error;
    }

    return data.tenant_group_data;
  }

  async getInstancesOfOrganisation(orgId: number): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenant_group_tenants')
      .select('tenant:tenant_id(*)')
      .eq('tenant_group', orgId);

    if (error) {
      Utils.showToast("Fehler beim Laden der Organisationen", "danger");
      throw error;
    }

    return data.map(d => d.tenant as any);
  }

  async getAllPersonsFromOrganisation(tenants: Tenant[]): Promise<Player[]> {
    const { data, error } = await supabase
      .from('player')
      .select('*')
      .in('tenantId', tenants.map(t => t.id))
      .is('pending', false)
      .is("left", null)
      .order('lastName', { ascending: true })
      .order('firstName', { ascending: true });

    if (error) {
      Utils.showToast("Fehler beim Laden der Personen", "danger");
      throw error;
    }

    return data as any;
  }

  async getOrganisationsFromUser(userId: string): Promise<Organisation[]> {
    const { data: tenants, error: fetchError } = await supabase
      .from('tenantUsers')
      .select('*, tenantId(*)')
      .eq('userId', userId)
      .or('role.eq.1, role.eq.5');

    if (fetchError) {
      Utils.showToast("Fehler beim Laden der Mandanten", "danger");
      throw fetchError;
    }

    const { data, error } = await supabase
      .from('tenant_group_tenants')
      .select('*, tenant_group_data:tenant_group(*)')
      .in('tenant_id', tenants.map((t: any) => t.tenantId.id));

    if (error) {
      Utils.showToast("Fehler beim Laden der Organisationen", "danger");
      throw error;
    }

    // make sure there are no duplicates
    const uniqueOrgs = Array.from(new Set(data.map(d => d.tenant_group_data.id)))
      .map(id => {
        return data.find(d => d.tenant_group_data.id === id).tenant_group_data;
      });

    return uniqueOrgs;
  }

  async getTenantsFromOrganisation(tenantId: number): Promise<Tenant[]> {
    const organisation = await this.getOrganisationFromTenant(tenantId);
    if (!organisation) {
      return [];
    }

    const { data, error } = await supabase
      .from('tenant_group_tenants')
      .select('*, tenant:tenant_id(*)')
      .eq('tenant_group', organisation.id);

    if (error) {
      Utils.showToast("Fehler beim Laden der Mandanten", "danger");
      throw error;
    }

    return data.map(d => d.tenant).filter((t: any) => t.id !== tenantId) as unknown as Tenant[];
  }

  async getLinkedTenants(tenantId: number): Promise<Tenant[]> {
    const { data: tenantGroupTenants, error: tenantGroupTenantsError } = await supabase
      .from('tenant_group_tenants')
      .select('*, tenant:tenant_id(*)');

    if (tenantGroupTenantsError) {
      Utils.showToast("Fehler beim Laden der Gruppenteilnehmer", "danger");
      throw tenantGroupTenantsError;
    }

    const groups = tenantGroupTenants.filter((tgt: any) => tgt.tenant_id === tenantId);
    return tenantGroupTenants.filter((tgt: any) =>
      groups.some((g: any) => g.tenant_group === tgt.tenant_group) && tgt.tenant_id !== tenantId
    ).map((tgt: any) => tgt.tenant) as unknown as Tenant[];
  }
}
