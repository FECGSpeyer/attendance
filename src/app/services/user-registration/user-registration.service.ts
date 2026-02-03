import { Injectable } from '@angular/core';
import { supabase } from '../base/supabase';
import { TenantUser } from '../../utilities/interfaces';
import { Role, SupabaseTable } from '../../utilities/constants';
import { Utils } from '../../utilities/Utils';
import axios from 'axios';

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
    const { userId, alreadyThere } = await this.getAppIdByEmail(email, tenantId, role) || {};

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

      await this.addUserToTenant(userId, role, email, tenantId);

      if (!self_register) {
        const res = await axios.post(`https://staccato-server.vercel.app/api/informAttendixUser`, {
          email,
          name,
          password,
          role: Utils.getRoleText(role),
          tenant: tenantName,
        });

        if (!res.data.mailSent) {
          throw new Error('Fehler beim Informieren des Benutzers');
        }
      }

      return userId;
    } else {
      const { data } = await supabase.rpc("get_user_id_by_email", {
        email: email.toLowerCase(),
      });

      if (data?.length && data[0].id) {
        await this.addUserToTenant(data[0].id, role, email, tenantId);
        return data[0].id;
      }
    }

    try {
      const res = await axios.post(`https://staccato-server.vercel.app/api/registerAttendixUser`, {
        email,
        name,
      });

      if (!res.data?.user?.id) {
        throw new Error('Fehler beim Erstellen des Accounts');
      }

      await this.addUserToTenant(res.data.user.id, role, email, tenantId);

      return res.data.user.id;
    } catch (e) {
      throw new Error(e.response?.data?.error?.message || "Fehler beim Erstellen des Accounts");
    }
  }

  async informUserAboutApproval(email: string, name: string, role: Role, tenantName: string): Promise<void> {
    const res = await axios.post(`https://staccato-server.vercel.app/api/approveAttendixUser`, {
      email,
      name,
      role: Utils.getRoleText(role),
      tenant: tenantName,
    });

    if (!res.data.mailSent) {
      throw new Error('Fehler beim Informieren des Benutzers');
    }
  }

  async informUserAboutReject(email: string, name: string, tenantName: string): Promise<void> {
    const res = await axios.post(`https://staccato-server.vercel.app/api/rejectAttendixUser`, {
      email,
      name,
      tenant: tenantName,
    });

    if (!res.data.mailSent) {
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
      .ilike('email', `%${email}%`);

    const foundTenantUser = data?.find((tenantUser: TenantUser) => tenantUser.tenantId === tenantId);

    if (foundTenantUser && foundTenantUser.role !== Role.ADMIN) {
      if (role === Role.ADMIN) {
        return { userId: foundTenantUser.userId, alreadyThere: true };
      }

      // Check if user exists in player/parent/viewer tables
      if ([Role.PLAYER, Role.RESPONSIBLE, Role.APPLICANT, Role.HELPER].includes(foundTenantUser.role)) {
        const { data: playersData, error: playersError } = await supabase
          .from('player')
          .select('*')
          .eq('tenantId', tenantId)
          .eq('appId', foundTenantUser.userId);

        if (playersError) throw new Error('Fehler beim Laden des Benutzers');

        if (playersData.length) {
          throw new Error(`Der Benutzer ist bereits in diesem Mandanten: ${playersData[0].firstName} ${playersData[0].lastName} (${Utils.getRoleText(foundTenantUser.role)})`);
        } else {
          await supabase.from('tenantUsers').delete().match({ tenantId, userId: foundTenantUser.userId });
          return undefined;
        }
      } else if (foundTenantUser.role === Role.PARENT) {
        const { data: parentsData, error: parentsError } = await supabase
          .from('parents')
          .select('*')
          .eq('tenantId', tenantId)
          .eq('appId', foundTenantUser.userId);

        if (parentsError) throw new Error('Fehler beim Laden des Benutzers');

        if (parentsData.length) {
          throw new Error(`Der Benutzer ist bereits in dieser Instanz: ${parentsData[0].firstName} ${parentsData[0].lastName} (Elternteil)`);
        } else {
          await supabase.from('tenantUsers').delete().match({ tenantId, userId: foundTenantUser.userId });
          return undefined;
        }
      } else if (foundTenantUser.role === Role.VIEWER) {
        const { data: viewersData, error: viewersError } = await supabase
          .from('viewers')
          .select('*')
          .eq('tenantId', tenantId)
          .eq('appId', foundTenantUser.userId);

        if (viewersError) throw new Error('Fehler beim Laden des Benutzers');

        if (viewersData.length) {
          throw new Error(`Der Benutzer ist bereits in diesem Mandanten: ${viewersData[0].firstName} ${viewersData[0].lastName} (Beobachter)`);
        } else {
          await supabase.from('tenantUsers').delete().match({ tenantId, userId: foundTenantUser.userId });
          return undefined;
        }
      } else {
        throw new Error('Der Benutzer ist bereits in diesem Mandanten');
      }
    }

    if (foundTenantUser?.role === Role.ADMIN) {
      return { userId: foundTenantUser.userId, alreadyThere: true };
    }

    if (error) throw new Error('Fehler beim Laden des Benutzers');

    return data?.length ? { userId: data[0].userId, alreadyThere: false } : undefined;
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
