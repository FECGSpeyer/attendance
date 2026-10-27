import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { TenantUser } from '../../utilities/interfaces';
import { Role, SupabaseTable } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';
import { translate } from '@jsverse/transloco';

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
            throw new Error(translate('db.updateRoleFailed'));
          }
        }
        return userId;
      }

      await this.addUserToTenant(userId, role, normalizedEmail, tenantId);

      if (!self_register) {
        const { data, error } = await supabase.functions.invoke('attendix-user', {
          body: {
            action: 'inform',
            email: normalizedEmail,
            name,
            role: Utils.getRoleText(role),
            roleId: role,
            tenantId,
          },
        });

        if (error || !data?.mailSent) {
          throw new Error(translate('db.notifyUserFailed'));
        }
      }

      return userId;
    }

    // User not found in any tenant, create new account
    try {
      const { data, error } = await supabase.functions.invoke('attendix-user', {
        body: {
          action: 'register',
          email: normalizedEmail,
          name,
          role: Utils.getRoleText(role),
          roleId: role,
          tenantId,
        },
      });

      if (error || !data?.user?.id) {
        throw new Error(translate('db.createAccountFailed'));
      }

      await this.addUserToTenant(data.user.id, role, normalizedEmail, tenantId);

      return data.user.id;
    } catch (e: any) {
      throw new Error(e.message || translate('db.createAccountFailed'));
    }
  }

  async informUserAboutApproval(email: string, name: string, role: Role, tenantId: number): Promise<void> {
    const { data, error } = await supabase.functions.invoke('attendix-user', {
      body: {
        action: 'approve',
        email,
        name,
        role: Utils.getRoleText(role),
        roleId: role,
        tenantId,
      },
    });

    if (error || !data?.mailSent) {
      throw new Error(translate('db.notifyUserFailed'));
    }
  }

  async informUserAboutReject(email: string, name: string, tenantId: number): Promise<void> {
    const { data, error } = await supabase.functions.invoke('attendix-user', {
      body: {
        action: 'reject',
        email,
        name,
        tenantId,
      },
    });

    if (error || !data?.mailSent) {
      throw new Error(translate('db.notifyUserFailed'));
    }
  }

  async addUserToTenant(userId: string, role: Role, email: string, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('tenantUsers')
      .insert({ userId, role, tenantId, email });

    if (error) {
      Utils.showToast(translate('svc.addUserToTenantFailed'), 'danger');
      throw new Error(translate('svc.addUserToTenantFailed'));
    }
  }

  private async updateTenantUserRole(userId: string, tenantId: number, role: Role): Promise<void> {
    const { error } = await supabase
      .from('tenantUsers')
      .update({ role })
      .match({ tenantId, userId });

    if (error) {
      throw new Error(translate('db.updateUserFailed'));
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

    if (error) {throw new Error(translate('db.loadUserFailed'));}

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

      if (playersError) {throw new Error(translate('db.loadUserFailed'));}

      if (playersData) {
        return {
          exists: true,
          errorMessage: translate('db.userAlreadyInTenantAs', { name: `${playersData.firstName} ${playersData.lastName}`, role: Utils.getRoleText(role) })
        };
      }
    } else if (role === Role.PARENT) {
      const { data: parentData, error: parentError } = await supabase
        .from('parents')
        .select('firstName, lastName')
        .eq('tenantId', tenantId)
        .eq('appId', userId)
        .maybeSingle();

      if (parentError) {throw new Error(translate('db.loadUserFailed'));}

      if (parentData) {
        return {
          exists: true,
          errorMessage: translate('db.userAlreadyInInstanceAs', { name: `${parentData.firstName} ${parentData.lastName}`, role: translate('db.roleParent') })
        };
      }
    } else if (role === Role.VIEWER) {
      const { data: viewerData, error: viewerError } = await supabase
        .from('viewers')
        .select('firstName, lastName')
        .eq('tenantId', tenantId)
        .eq('appId', userId)
        .maybeSingle();

      if (viewerError) {throw new Error(translate('db.loadUserFailed'));}

      if (viewerData) {
        return {
          exists: true,
          errorMessage: translate('db.userAlreadyInTenantAs', { name: `${viewerData.firstName} ${viewerData.lastName}`, role: translate('db.roleViewer') })
        };
      }
    } else {
      throw new Error(translate('db.userAlreadyInTenant'));
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
      Utils.showToast(`${firstName} ${lastName} - Fehler beim Erstellen des Accounts: ${error.message}`, 'danger');
      throw error;
    }

    const { data, error: updateError } = await supabase
      .from(SupabaseTable.PLAYER)
      .update({ appId })
      .match({ id: playerId })
      .select()
      .single();

    if (updateError) {
      throw new Error(translate('db.updateUserFailed2'));
    }

    return data;
  }
}
