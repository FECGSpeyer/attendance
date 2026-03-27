import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { TenantUser } from '../../utilities/interfaces';
import { Role, SupabaseTable } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class UserRegistrationService {

  async registerUser(
    email: string,
    name: string,
    role: Role,
    tenantId: number,
    tenantName: string,
    password?: string,
    self_register?: boolean,
  ): Promise<string> {
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    const { userId, alreadyThere } = await this.getAppIdByEmail(normalizedEmail, tenantId, role) || {};

    if (userId) {
      if (alreadyThere) {
        if (role === Role.ADMIN) {
          try {
            await this.updateTenantUserRole(userId, tenantId, Role.ADMIN);
          } catch (error) {
            throw new Error('Fehler beim Aktualisieren der Benutzerrolle');
          }
        }
        return userId;
      }

      await this.addUserToTenant(userId, role, normalizedEmail, tenantId);

      if (!self_register) {
        const res = await fetch(`https://staccato-server.vercel.app/api/informAttendixUser`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            name,
            password,
            role: Utils.getRoleText(role),
            tenant: tenantName,
          }),
        });
        const data = await res.json();

        if (!data.mailSent) {
          throw new Error('Fehler beim Informieren des Benutzers');
        }
      }

      return userId;
    }

    // User not found in any tenant, create new account
    try {
      const res = await fetch(`https://staccato-server.vercel.app/api/registerAttendixUser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, name }),
      });
      const data = await res.json();

      if (!data?.user?.id) {
        throw new Error('Fehler beim Erstellen des Accounts');
      }

      await this.addUserToTenant(data.user.id, role, normalizedEmail, tenantId);

      return data.user.id;
    } catch (e: any) {
      throw new Error(e.message || "Fehler beim Erstellen des Accounts");
    }
  }

  async informUserAboutApproval(email: string, name: string, role: Role, tenantName: string): Promise<void> {
    const res = await fetch(`https://staccato-server.vercel.app/api/approveAttendixUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name,
        role: Utils.getRoleText(role),
        tenant: tenantName,
      }),
    });
    const data = await res.json();

    if (!data.mailSent) {
      throw new Error('Fehler beim Informieren des Benutzers');
    }
  }

  async informUserAboutReject(email: string, name: string, tenantName: string): Promise<void> {
    const res = await fetch(`https://staccato-server.vercel.app/api/rejectAttendixUser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name,
        tenant: tenantName,
      }),
    });
    const data = await res.json();

    if (!data.mailSent) {
      throw new Error('Fehler beim Informieren des Benutzers');
    }
  }

  async addUserToTenant(userId: string, role: Role, email: string, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('tenantUsers')
      .insert({ userId, role, tenantId, email });

    if (error) {
      Utils.showToast("Fehler beim Hinzufügen des Benutzers zum Mandanten", "danger");
      throw new Error('Fehler beim Hinzufügen des Benutzers zum Mandanten');
    }
  }

  private async updateTenantUserRole(userId: string, tenantId: number, role: Role): Promise<void> {
    const { error } = await supabase
      .from('tenantUsers')
      .update({ role })
      .match({ tenantId, userId });

    if (error) {
      throw new Error('Fehler beim Updaten des Benutzers');
    }
  }

  async getAppIdByEmail(email: string, tenantId: number, role?: Role): Promise<{
    userId: string;
    alreadyThere: boolean;
  } | undefined> {
    const { data, error } = await supabase
      .from('tenantUsers')
      .select('*')
      .eq('email', email.toLowerCase().trim());

    if (error) throw new Error('Fehler beim Laden des Benutzers');

    const foundTenantUser = data?.find((tenantUser: TenantUser) => tenantUser.tenantId === tenantId);

    if (foundTenantUser && foundTenantUser.role !== Role.ADMIN) {
      if (role === Role.ADMIN) {
        return { userId: foundTenantUser.userId, alreadyThere: true };
      }

      // Validate user exists in appropriate table for their role
      const validationResult = await this.validateUserExistsInRoleTable(
        foundTenantUser.userId,
        foundTenantUser.role,
        tenantId
      );

      if (validationResult.exists) {
        throw new Error(validationResult.errorMessage);
      } else {
        // User doesn't exist in role table, clean up orphaned tenantUser record
        await supabase.from('tenantUsers').delete().match({ tenantId, userId: foundTenantUser.userId });
        return undefined;
      }
    }

    if (foundTenantUser?.role === Role.ADMIN) {
      return { userId: foundTenantUser.userId, alreadyThere: true };
    }

    return data?.length ? { userId: data[0].userId, alreadyThere: false } : undefined;
  }

  private async validateUserExistsInRoleTable(
    userId: string,
    role: Role,
    tenantId: number
  ): Promise<{ exists: boolean; errorMessage?: string }> {
    // Check if user exists in player/parent/viewer tables based on role
    if ([Role.PLAYER, Role.RESPONSIBLE, Role.APPLICANT, Role.HELPER].includes(role)) {
      const { data: playersData, error: playersError } = await supabase
        .from('player')
        .select('firstName, lastName')
        .eq('tenantId', tenantId)
        .eq('appId', userId)
        .maybeSingle();

      if (playersError) throw new Error('Fehler beim Laden des Benutzers');

      if (playersData) {
        return {
          exists: true,
          errorMessage: `Der Benutzer ist bereits in diesem Mandanten: ${playersData.firstName} ${playersData.lastName} (${Utils.getRoleText(role)})`
        };
      }
    } else if (role === Role.PARENT) {
      const { data: parentData, error: parentError } = await supabase
        .from('parents')
        .select('firstName, lastName')
        .eq('tenantId', tenantId)
        .eq('appId', userId)
        .maybeSingle();

      if (parentError) throw new Error('Fehler beim Laden des Benutzers');

      if (parentData) {
        return {
          exists: true,
          errorMessage: `Der Benutzer ist bereits in dieser Instanz: ${parentData.firstName} ${parentData.lastName} (Elternteil)`
        };
      }
    } else if (role === Role.VIEWER) {
      const { data: viewerData, error: viewerError } = await supabase
        .from('viewers')
        .select('firstName, lastName')
        .eq('tenantId', tenantId)
        .eq('appId', userId)
        .maybeSingle();

      if (viewerError) throw new Error('Fehler beim Laden des Benutzers');

      if (viewerData) {
        return {
          exists: true,
          errorMessage: `Der Benutzer ist bereits in diesem Mandanten: ${viewerData.firstName} ${viewerData.lastName} (Beobachter)`
        };
      }
    } else {
      throw new Error('Der Benutzer ist bereits in diesem Mandanten');
    }

    return { exists: false };
  }

  async createPlayerAccount(
    playerId: number,
    email: string,
    firstName: string,
    lastName: string,
    instrumentId: number,
    mainGroupId: number | undefined,
    tenantId: number,
    tenantName: string
  ): Promise<any> {
    const role = (mainGroupId === instrumentId ? Role.RESPONSIBLE : Role.PLAYER);

    let appId: string;
    try {
      appId = await this.registerUser(email, firstName, role, tenantId, tenantName);
    } catch (error) {
      Utils.showToast(`${firstName} ${lastName} - Fehler beim Erstellen des Accounts: ${error.message}`, "danger");
      throw error;
    }

    const { data, error: updateError } = await supabase
      .from(SupabaseTable.PLAYER)
      .update({ appId })
      .match({ id: playerId })
      .select()
      .single();

    if (updateError) {
      throw new Error('Fehler beim updaten des Benutzers');
    }

    return data;
  }
}
