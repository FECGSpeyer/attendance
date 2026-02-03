import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@supabase/supabase-js';
import axios from 'axios';
import { Role } from '../../utilities/constants';
import { Player, TenantUser } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { supabase } from '../base/supabase';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public user: User;

  constructor(private router: Router) {}

  async checkToken(): Promise<User | null> {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user?.email) {
      this.user = data.session.user;
      return this.user;
    }
    return null;
  }

  async login(email: string, password: string, returnEarly: boolean = false): Promise<{ success: boolean; user?: User }> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email, password,
    });

    if (error) {
      switch (error.code) {
        case "invalid_login_credentials":
          Utils.showToast("Ungültige Anmeldedaten", "danger");
          break;
        case "user_disabled":
          Utils.showToast("Dein Konto wurde deaktiviert. Bitte wende dich an den Administrator deiner Instanz.", "danger");
          break;
        case "too_many_requests":
          Utils.showToast("Zu viele Anmeldeversuche. Bitte versuche es später erneut.", "danger");
          break;
        case "invalid_email":
          Utils.showToast("Ungültige E-Mail Adresse", "danger");
          break;
        case "invalid_password":
          Utils.showToast("Ungültiges Passwort", "danger");
          break;
        case "user_not_found":
          Utils.showToast("Benutzer nicht gefunden", "danger");
          break;
        case "email_not_confirmed":
          Utils.showToast("Bitte bestätige zuerst deine E-Mail-Adresse.", "danger");
          break;
        case "password_strength_insufficient":
          Utils.showToast("Das Passwort erfüllt nicht die Sicherheitsanforderungen.", "danger");
          break;
        case "invalid_credentials":
          Utils.showToast("Ungültige Anmeldedaten", "danger");
          break;
        default:
          Utils.showToast(error.code === "email_not_confirmed" ? "Bitte bestätige zuerst deine E-Mail-Adresse." : "Fehler beim Anmelden", "danger");
          break;
      }
      throw error;
    }

    if (data.user) {
      this.user = data.user;
      return { success: true, user: data.user };
    }

    Utils.showToast("Bitte gib die richtigen Daten an!", "danger");
    return { success: false };
  }

  async register(email: string, password: string): Promise<{ user: User; new: boolean } | null> {
    const { error, data } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `https://attendix.de/login`,
      }
    });

    if (error) {
      Utils.showToast("Fehler beim Registrieren", "danger");
      return null;
    }

    if (!data.user?.identities?.length) {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email, password,
      });

      if (loginError) {
        throw new Error('Deine E-Mail-Adresse existiert bereits. Bitte melde dich an.');
      }

      return {
        user: loginData.user,
        new: false,
      };
    }

    return {
      user: data.user,
      new: true,
    };
  }

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    this.user = undefined;
    this.router.navigateByUrl('/login');
  }

  async changePassword(password: string): Promise<void> {
    await supabase.auth.updateUser({ password });
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://attendix.de/resetPassword',
    });

    if (error) {
      Utils.showToast("Fehler beim Zurücksetzen des Passworts", "danger");
      throw error;
    }

    Utils.showToast("E-Mail zum Zurücksetzen des Passworts wurde gesendet", "success");
  }

  async updatePassword(password: string): Promise<void> {
    const { data, error } = await supabase.auth.updateUser({ password });

    if (data) {
      Utils.showToast('Passwort wurde erfolgreich aktualisiert', 'success');
    }
    if (error) {
      Utils.showToast('Fehler beim zurücksetzen, versuche es noch einmal', "danger");
    }
  }

  async registerUser(
    email: string,
    name: string,
    role: Role,
    tenantId: number,
    tenantName: string,
    password?: string,
    self_register?: boolean,
    getAppIdByEmail?: (email: string, tenantId: number, role?: Role) => Promise<{ userId: string; alreadyThere: boolean } | undefined>,
    addUserToTenant?: (userId: string, role: Role, email: string, tenantId?: number) => Promise<void>,
    updateTenantUser?: (updates: Partial<TenantUser>, userId: string) => Promise<void>
  ): Promise<string> {
    const result = await getAppIdByEmail(email, tenantId, role);
    const { userId, alreadyThere } = result || {};

    if (userId) {
      if (alreadyThere) {
        if (role === Role.ADMIN) {
          try {
            await updateTenantUser({ role: Role.ADMIN }, userId);
          } catch (error) {
            throw new Error('Fehler beim Aktualisieren der Benutzerrolle');
          }
        }
        return userId;
      }
      await addUserToTenant(userId, role, email, tenantId);
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
        await addUserToTenant(data[0].id, role, email, tenantId);
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

      await addUserToTenant(res.data.user.id, role, email);
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

  async removeEmailFromAuth(appId: string, email: string, deleteAdmin: boolean = false): Promise<void> {
    const res = await axios.post(`https://staccato-server.vercel.app/api/deleteAttendixUser`, {
      userId: appId,
      email,
      deleteAdmin,
    });

    if (!res.data.deleted) {
      Utils.showToast("Fehler beim Löschen des Benutzers", "danger");
    }
  }
}
