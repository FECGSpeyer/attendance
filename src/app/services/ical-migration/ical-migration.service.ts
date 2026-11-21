import { Injectable } from '@angular/core';
import { AlertController, isPlatform } from '@ionic/angular/lazy';
import { Browser } from '@capacitor/browser';
import { translate } from '@jsverse/transloco';
import { environment } from 'src/environments/environment';
import { DbService } from '../db.service';
import { Utils } from 'src/app/utilities/Utils';

interface LegacyIcalHit {
  fn: string;
  query: string;
  last_seen: string;
}

const DISMISSED_KEY = 'icalMigrationDismissed';
/** After "Erledigt" the notice comes back only if the old address is still fetched this much later. */
const RESHOW_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Since the move to our own server (20.11.2026) calendar subscriptions with the
 * old supabase.co address only work through a temporary forward. The forward
 * records which feeds are still fetched; this service tells exactly those
 * people to subscribe again with the new address.
 */
@Injectable({ providedIn: 'root' })
export class IcalMigrationService {
  private checked = false;

  constructor(
    private db: DbService,
    private alertController: AlertController,
  ) {}

  async checkOnce(): Promise<void> {
    if (this.checked) return;
    this.checked = true;
    try {
      const { data, error } = await this.db.getSupabase().rpc('my_ical_legacy_hits');
      if (error || !Array.isArray(data)) return;
      const dismissed = this.readDismissed();
      for (const hit of data as LegacyIcalHit[]) {
        const id = `${hit.fn}?${hit.query}`;
        const dismissedAt = dismissed[id];
        if (dismissedAt && new Date(hit.last_seen).getTime() < dismissedAt + RESHOW_AFTER_MS) continue;
        await this.showNotice(hit, id);
      }
    } catch (e) {
      console.warn('[IcalMigration] check failed', e);
    }
  }

  private async showNotice(hit: LegacyIcalHit, id: string): Promise<void> {
    const link = `${environment.apiUrl}/functions/v1/${hit.fn}?${hit.query}`;
    const alert = await this.alertController.create({
      header: translate('icalMigration.header'),
      message: translate('icalMigration.message', { link }),
      backdropDismiss: false,
      buttons: [
        {
          text: translate('settings.copyLink'),
          handler: () => {
            navigator?.clipboard?.writeText(link);
            Utils.showToast(translate('settings.linkCopied'), 'success');
            return false;
          },
        },
        {
          text: translate('settings.openGuide'),
          handler: () => {
            Browser.open({ url: isPlatform('ios') ? 'https://support.apple.com/de-de/102301' : 'https://support.google.com/calendar/answer/37100?hl=de&co=GENIE.Platform%3DAndroid' });
            return false;
          },
        },
        {
          text: translate('icalMigration.done'),
          handler: () => this.saveDismissed(id),
        },
        { text: translate('svc.later'), role: 'cancel' },
      ],
    });
    await alert.present();
    await alert.onDidDismiss();
  }

  private readDismissed(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  private saveDismissed(id: string): void {
    try {
      const all = this.readDismissed();
      all[id] = Date.now();
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(all));
    } catch {
      // Storage blocked: the notice simply shows again next time.
    }
  }
}
