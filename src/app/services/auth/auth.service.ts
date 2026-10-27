import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { Role } from '../../utilities/constants';
import { Player, TenantUser } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { supabase } from '../base/supabase';
import { translate } from '@jsverse/transloco';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public user: User;

  /** Resolves once the initial session has been restored from storage. */
  public readonly sessionReady: Promise<void>;
  private resolveSessionReady: () => void;
  private initialSessionHandled = false;

  constructor(private router: Router) {
    this.sessionReady = new Promise<void>((resolve) => {
      this.resolveSessionReady = resolve;
    });
    this.listenToAuthChanges();
  }

  private listenToAuthChanges(): void {
    supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      switch (event) {
        case 'INITIAL_SESSION':
          this.handleSession(session);
          this.initialSessionHandled = true;
          this.resolveSessionReady();
          break;
        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
        case 'USER_UPDATED':
          this.handleSession(session);
          break;
        case 'SIGNED_OUT':
          this.user = undefined;
          break;
      }
    });
  }

  private handleSession(session: Session | null): void {
    if (session?.user?.email) {
      this.user = session.user;
    } else {
      this.user = undefined;
    }
  }

  async checkToken(): Promise<User | null> {
    await this.sessionReady;
    return this.user ?? null;
  }

  async login(email: string, password: string, returnEarly: boolean = false): Promise<{ success: boolean; user?: User }> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email, password,
    });

    if (error) {
      switch (error.code) {
        case 'invalid_login_credentials':
          Utils.showToast(translate('auth.invalidCredentials'), 'danger');
          break;
        case 'user_disabled':
          Utils.showToast(translate('db.accountDisabled'), 'danger');
          break;
        case 'too_many_requests':
          Utils.showToast(translate('db.tooManyLogins'), 'danger');
          break;
        case 'invalid_email':
          Utils.showToast(translate('db.invalidEmail'), 'danger');
          break;
        case 'invalid_password':
          Utils.showToast(translate('db.invalidPassword'), 'danger');
          break;
        case 'user_not_found':
          Utils.showToast('Benutzer nicht gefunden', 'danger');
          break;
        case 'email_not_confirmed':
          Utils.showToast(translate('auth.confirmEmailFirst'), 'danger');
          break;
        case 'password_strength_insufficient':
          Utils.showToast(translate('db.weakPasswordRequirements'), 'danger');
          break;
        case 'invalid_credentials':
          Utils.showToast(translate('auth.invalidCredentials'), 'danger');
          break;
        default:
          Utils.showToast(error.code === 'email_not_confirmed' ? translate('auth.confirmEmailFirst') : translate('db.loginFailed'), 'danger');
          break;
      }
      throw error;
    }

    if (data.user) {
      this.user = data.user;
      return { success: true, user: data.user };
    }

    Utils.showToast(translate('db.enterCorrectData'), 'danger');
    return { success: false };
  }

  async register(email: string, password: string): Promise<{ user: User; new: boolean } | null> {
    const { error, data } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `https://attendix.de/login`,
        data: { terms_accepted_at: new Date().toISOString() },
      }
    });

    if (error) {
      Utils.showToast(translate('db.registerFailed'), 'danger');
      return null;
    }

    if (!data.user?.identities?.length) {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email, password,
      });

      if (loginError) {
        throw new Error(translate('db.emailExists'));
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

  async resendConfirmationEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `https://attendix.de/login`,
      }
    });

    if (error) {
      Utils.showToast(translate('auth.resendConfirmationFailed'), 'danger');
      throw error;
    }

    Utils.showToast(translate('auth.confirmationResent'), 'success');
  }

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    this.user = undefined;
    localStorage.removeItem('currentTenantId');
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
      Utils.showToast(translate('auth.resetFailed'), 'danger');
      throw error;
    }

    Utils.showToast(translate('auth.resetSent'), 'success');
  }

  async updatePassword(password: string): Promise<void> {
    const { data, error } = await supabase.auth.updateUser({ password });

    if (data) {
      Utils.showToast(translate('db.passwordUpdated'), 'success');
    }
    if (error) {
      Utils.showToast(translate('auth.resetRetry'), 'danger');
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
            throw new Error(translate('db.updateRoleFailed'));
          }
        }
        return userId;
      }
      await addUserToTenant(userId, role, email, tenantId);
      if (!self_register) {
        const { data, error } = await supabase.functions.invoke('attendix-user', {
          body: {
            action: 'inform',
            email,
            name,
            role: Utils.getRoleText(role),
            tenantId,
          },
        });

        if (error || !data?.mailSent) {
          throw new Error(translate('db.notifyUserFailed'));
        }
      }
      return userId;
    } else {
      const { data } = await supabase.rpc('get_user_id_by_email', {
        email: email.toLowerCase(),
      });

      if (data?.length && data[0].id) {
        await addUserToTenant(data[0].id, role, email, tenantId);
        return data[0].id;
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke('attendix-user', {
        body: { action: 'register', email, name, tenantId },
      });

      if (error || !data?.user?.id) {
        throw new Error(translate('db.createAccountFailed'));
      }

      await addUserToTenant(data.user.id, role, email);
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
}
