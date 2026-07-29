import { Injectable } from '@angular/core';
import { app as teamsApp } from '@microsoft/teams-js';

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
    } catch {
      // Not running inside Teams (or the SDK couldn't reach the host).
      this.inTeams = false;
    }
  }
}
