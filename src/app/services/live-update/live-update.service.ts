import { Injectable, signal } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { LiveUpdate } from '@capawesome/capacitor-live-update';
import { supabase } from '../base/supabase';

/**
 * Self-hosted OTA updates via @capawesome/capacitor-live-update.
 *
 * Flow on every native cold start:
 *   1. LiveUpdate.ready()  — confirms the currently-active bundle booted OK
 *      (any pending rollback timer is cancelled).
 *   2. Read native app version (e.g. "4.0.7").
 *   3. GET manifest.json from the public Supabase Storage bucket. The
 *      manifest is a single JSON file we overwrite each time we ship an OTA.
 *   4. If manifest.bundleId !== current bundle AND manifest.minNativeVersion
 *      is satisfied, downloadBundle() + setNextBundle().
 *   5. Ask the user whether to apply now (same UX as the SwUpdate flow on web).
 *
 * The manifest is intentionally tiny so this is one fast request on launch.
 * Schema (stored at `ota-bundles/manifest.json` in Supabase Storage):
 *
 *   {
 *     "bundleId":  "4.0.8-1719753600",       // unique id, used to skip re-download
 *     "url":       "https://.../bundles/4.0.8-1719753600.zip",
 *     "signature": "base64-RSA-SHA256-of-zip", // verified by the plugin against
 *                                              // LiveUpdate.publicKey from
 *                                              // capacitor.config.json
 *     "minNativeVersion": "4.0.7"            // native shells older than this won't pull
 *   }
 */

interface OtaManifest {
  bundleId: string;
  url: string;
  /** Base64-encoded RSA-SHA256 signature of the ZIP. Verified against the
   *  publicKey in capacitor.config.json. Without it the plugin still works
   *  but trusts the CDN; we always set it. */
  signature: string;
  /** Skip the update on native shells older than this (semver-ish "x.y.z"). */
  minNativeVersion?: string;
}

const BUCKET = 'ota-bundles';
const MANIFEST_PATH = 'manifest.json';

@Injectable({ providedIn: 'root' })
export class LiveUpdateService {
  private initialized = false;

  /**
   * True once an update has been downloaded/installed and is ready to apply.
   * Set for both the native OTA flow (bundle staged via setNextBundle) and the
   * web SwUpdate flow (new service worker installed). Pages read this to show a
   * manual "update now" button after the user tapped "Später" on the prompt.
   */
  readonly updateAvailable = signal(false);

  /**
   * How to apply the pending update. Native: LiveUpdate.reload(). Web: a full
   * page reload activating the new service worker. Set alongside updateAvailable.
   */
  private applyFn: (() => void | Promise<void>) | null = null;

  constructor(private alertController: AlertController) {}

  /**
   * Called once from AppComponent. No-op on web — the SwUpdate flow there
   * already handles updates.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (!Capacitor.isNativePlatform()) return;
    this.initialized = true;

    // Always call ready() — this confirms the currently-running bundle booted
    // far enough to be considered healthy. If we ever enable readyTimeout in
    // capacitor.config, a missed ready() call triggers an automatic rollback.
    try {
      await LiveUpdate.ready();
    } catch (e) {
      console.warn('[LiveUpdate] ready() failed', e);
    }

    // Fetch + apply runs in the background; don't block app startup.
    this.checkForUpdate().catch(err => console.warn('[LiveUpdate] check failed', err));
  }

  private async checkForUpdate(): Promise<void> {
    const manifest = await this.fetchManifest();
    if (!manifest) return;

    const nativeVersion = (await CapApp.getInfo()).version;
    if (manifest.minNativeVersion && !this.satisfiesMin(nativeVersion, manifest.minNativeVersion)) {
      console.log(
        `[LiveUpdate] skipping bundle ${manifest.bundleId}: native ${nativeVersion} < min ${manifest.minNativeVersion}`,
      );
      return;
    }

    const current = await LiveUpdate.getCurrentBundle();
    if (current?.bundleId === manifest.bundleId) return; // already on latest OTA

    // Fresh-install / same-version guard: if no OTA bundle is active yet, the app
    // is running the JS baked into the native shell. Only pull an OTA bundle that
    // is strictly NEWER than the native shell version — otherwise we'd prompt the
    // user to "update" to the same code they just installed from the store (the
    // manifest bundleId can never match a store build, which ships no OTA id).
    const isOtaActive = !!current?.bundleId;
    if (
      !isOtaActive &&
      this.compareVersions(this.bundleVersion(manifest.bundleId), nativeVersion) <= 0
    ) {
      console.log(
        `[LiveUpdate] skipping bundle ${manifest.bundleId}: not newer than native ${nativeVersion} and no OTA active`,
      );
      return;
    }

    // Skip re-downloading a bundle we already have on disk.
    const { bundleIds } = await LiveUpdate.getBundles();
    if (!bundleIds.includes(manifest.bundleId)) {
      console.log(`[LiveUpdate] downloading bundle ${manifest.bundleId}`);
      await LiveUpdate.downloadBundle({
        bundleId: manifest.bundleId,
        url: manifest.url,
        signature: manifest.signature,
      });
    }

    await LiveUpdate.setNextBundle({ bundleId: manifest.bundleId });
    this.markAvailable(async () => {
      try {
        await LiveUpdate.reload();
      } catch (e) {
        console.warn('[LiveUpdate] reload failed', e);
      }
    });
    await this.promptReload();
  }

  private async fetchManifest(): Promise<OtaManifest | null> {
    // Public bucket: getPublicUrl is sync and never errors; we hit the CDN with
    // a cache-busting query param so we always see the freshest manifest.
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(MANIFEST_PATH);
    if (!data?.publicUrl) return null;
    const url = `${data.publicUrl}?t=${Date.now()}`;

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const json = (await res.json()) as OtaManifest;
      if (!json?.bundleId || !json?.url || !json?.signature) return null;
      return json;
    } catch (e) {
      console.warn('[LiveUpdate] manifest fetch failed', e);
      return null;
    }
  }

  /** Extract the version prefix from a bundleId (`"4.2.0-1786448165423"` -> `"4.2.0"`). */
  private bundleVersion(bundleId: string): string {
    return bundleId.split('-')[0];
  }

  /** Numeric "x.y.z" compare. Returns -1 if a<b, 0 if equal, 1 if a>b. */
  private compareVersions(a: string, b: string): number {
    const av = a.split('.').map(s => parseInt(s, 10) || 0);
    const bv = b.split('.').map(s => parseInt(s, 10) || 0);
    const len = Math.max(av.length, bv.length);
    for (let i = 0; i < len; i++) {
      const x = av[i] ?? 0;
      const y = bv[i] ?? 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  /** True when `current` is >= `min` (equal is fine). */
  private satisfiesMin(current: string, min: string): boolean {
    return this.compareVersions(current, min) >= 0;
  }

  private async promptReload(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Update verfügbar',
      message: 'Eine neue Version ist verfügbar. Die Aktualisierung dauert nur einen kurzen Moment und du kannst danach direkt weiterarbeiten. Jetzt aktualisieren?',
      buttons: [
        // "Später" keeps the update staged; updateAvailable stays true so the
        // login and settings pages can offer a manual "Aktualisieren" button.
        { text: 'Später', role: 'cancel' },
        {
          text: 'Aktualisieren',
          handler: async () => {
            await this.applyUpdate();
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Register a downloaded/installed update as ready to apply. Called by the
   * native OTA flow here and by the web SwUpdate flow in AppComponent.
   */
  markAvailable(apply: () => void | Promise<void>): void {
    this.applyFn = apply;
    this.updateAvailable.set(true);
  }

  /** Apply the pending update, if any. Safe to call when none is staged. */
  async applyUpdate(): Promise<void> {
    if (!this.applyFn) return;
    await this.applyFn();
  }
}
