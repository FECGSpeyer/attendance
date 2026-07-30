import { Injectable } from '@angular/core';
import { app as teamsApp, authentication } from '@microsoft/teams-js';
import { environment } from '../../../environments/environment';
import { supabase } from '../base/supabase';
import { AuthService } from '../auth/auth.service';
import { Utils } from '../../utilities/Utils';

/** Result of an attempted silent Teams sign-in. */
export type SsoResult = 'ok' | 'needs-link' | 'failed';

/**
 * True when the app is running inside an iframe (e.g. a Microsoft Teams tab,
 * which frames us from teams.cloud.microsoft / *.teams.microsoft.com). Safe to
 * call at module-evaluation time, before Angular bootstraps — used to disable
 * the service worker in embedded contexts. A top-level PWA/browser visit is not
 * framed; a Teams tab always is.
 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access to window.top throws — that only happens when framed.
    return true;
  }
}

/**
 * Detects and initializes the Microsoft Teams host context.
 *
 * The app is embedded in Teams as a personal tab (an iframe pointing at the
 * live web app). Teams runs the tab in a web context, so
 * `Capacitor.isNativePlatform()` returns false there just like a normal
 * browser and cannot be used to distinguish Teams. Instead we attempt the
 * Teams JS SDK initialization: if it succeeds within a short timeout we are
 * inside Teams; otherwise we are in a plain browser / PWA / native app.
 */
@Injectable({ providedIn: 'root' })
export class TeamsService {
  private inTeams = false;
  private initialized = false;

  private readonly ssoUrl = `${environment.apiUrl}/functions/v1/teams-sso`;

  constructor(private authSvc: AuthService) {}

  isInTeams(): boolean {
    return this.inTeams;
  }

  /**
   * Idempotent. Resolves once we know whether we're running inside Teams.
   * Never rejects: outside Teams the SDK init hangs, so we race it against a
   * timeout and treat the timeout as "not in Teams".
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    try {
      await Promise.race([
        teamsApp.initialize(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('teams-init-timeout')), 2000)
        ),
      ]);
      this.inTeams = true;
      // Tell Teams the tab loaded successfully so it stops the loading spinner.
      teamsApp.notifySuccess();

      // Follow the Teams in-app theme. Teams' theme toggle does NOT change the
      // OS `prefers-color-scheme`, so the app's media-query dark mode won't react
      // on its own — we bridge it to a body class the SCSS also targets.
      try {
        const ctx = await teamsApp.getContext();
        this.applyTeamsTheme(ctx.app.theme);
        teamsApp.registerOnThemeChangeHandler((theme) => this.applyTeamsTheme(theme));
      } catch (e) {
        console.error('[teams] theme wiring failed:', e);
      }
    } catch {
      // Not running inside Teams (or the SDK couldn't reach the host).
      this.inTeams = false;
    }
  }

  /** Maps a Teams theme ('default' | 'dark' | 'contrast') to a body class. */
  private applyTeamsTheme(theme: string): void {
    const body = document.body.classList;
    body.remove('teams-dark', 'teams-contrast');
    if (theme === 'dark') {
      body.add('teams-dark');
    } else if (theme === 'contrast') {
      body.add('teams-contrast');
    }
  }

  /**
   * Attempts a silent Microsoft SSO sign-in inside Teams.
   *
   * Gets an Entra token via getAuthToken(), sends it to the teams-sso function,
   * and — if this Microsoft identity is already linked to an Attendix account —
   * establishes the Supabase session (verifyOtp on the returned token_hash,
   * which emits SIGNED_IN and flows through AuthService). Returns:
   *   'ok'         — signed in silently
   *   'needs-link' — verified Microsoft user, but no linked Attendix account yet
   *   'failed'     — not in Teams, token/SDK error, or server error
   */
  async ssoSignIn(): Promise<SsoResult> {
    if (!this.inTeams) {
      return 'failed';
    }
    try {
      const token = await authentication.getAuthToken();
      const res = await this.postSso({ token });
      if (res.linked && res.token_hash) {
        return (await this.consumeTokenHash(res.token_hash)) ? 'ok' : 'failed';
      }
      return res.linked === false ? 'needs-link' : 'failed';
    } catch (e) {
      console.error('[teams] ssoSignIn failed:', e);
      return 'failed';
    }
  }

  /**
   * One-time account linking. The user proves ownership of their Attendix
   * account with email+password; we then bind their Microsoft identity to it
   * server-side so future launches sign in silently via ssoSignIn().
   */
  async ssoLink(email: string, password: string): Promise<boolean> {
    if (!this.inTeams) {
      return false;
    }
    try {
      // Prove Attendix account ownership -> yields a Supabase session.
      const { success } = await this.authSvc.login(email, password);
      if (!success) {
        return false;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        return false;
      }

      const token = await authentication.getAuthToken();
      const res = await this.postSso({ action: 'link', token, access_token: accessToken });
      if (res.linked && res.token_hash) {
        // Settle on the freshly minted session so state is consistent.
        return await this.consumeTokenHash(res.token_hash);
      }
      Utils.showToast(res.error || 'Verknüpfung fehlgeschlagen', 'danger');
      return false;
    } catch (e) {
      console.error('[teams] ssoLink failed:', e);
      return false;
    }
  }

  /** Establishes a Supabase session from a server-minted magic-link token_hash. */
  private async consumeTokenHash(tokenHash: string): Promise<boolean> {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    });
    if (error) {
      console.error('[teams] verifyOtp failed:', error);
      return false;
    }
    return true;
  }

  /**
   * Builds a shareable Teams deep link that opens the Attendix personal tab at a
   * specific attendance (and tenant). Returns null when not in Teams so callers
   * can fall back to a plain web link. Format per Teams deep-link spec:
   * https://teams.microsoft.com/l/entity/<appId>/<entityId>?webUrl=<url>&context=<ctx>
   */
  attendanceDeepLink(appId: string, attendanceId: number, tenantId: number): string | null {
    if (!this.inTeams) {
      return null;
    }
    const webUrl = encodeURIComponent(
      `https://attendix.de/open-attendance?id=${attendanceId}&tenantId=${tenantId}`,
    );
    const context = encodeURIComponent(JSON.stringify({ subEntityId: `att-${attendanceId}` }));
    return `https://teams.microsoft.com/l/entity/${appId}/attendix?webUrl=${webUrl}&context=${context}`;
  }

  private async postSso(
    body: Record<string, unknown>,
  ): Promise<{ linked?: boolean; token_hash?: string; error?: string }> {
    const resp = await fetch(this.ssoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: environment.apiKey,
        Authorization: `Bearer ${environment.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // 409 (already linked elsewhere) / 401 (bad token) carry a message.
      return { linked: false, error: data?.error };
    }
    return data;
  }
}