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
      const open = this.uniqueFeeds(data as LegacyIcalHit[]).filter((hit) => {
        const dismissedAt = dismissed[this.hitId(hit)];
        return !dismissedAt || new Date(hit.last_seen).getTime() >= dismissedAt + RESHOW_AFTER_MS;
      });
      // One notice for all affected subscriptions, never one per subscription.
      if (open.length) await this.showNotice(open);
    } catch (e) {
      console.warn('[IcalMigration] check failed', e);
    }
  }

  /**
   * The same calendar is often subscribed several times (other devices,
   * language, "hide cancelled"). Keep only the newest link per calendar.
   */
  private uniqueFeeds(hits: LegacyIcalHit[]): LegacyIcalHit[] {
    const byFeed = new Map<string, LegacyIcalHit>();
    for (const hit of hits) {
      const feed = this.hitId(hit);
      const known = byFeed.get(feed);
      if (!known || new Date(hit.last_seen) > new Date(known.last_seen)) byFeed.set(feed, hit);
    }
    return [...byFeed.values()].slice(0, 3);
  }

  /** One id per calendar, so duplicates of the same subscription count as one. */
  private hitId(hit: LegacyIcalHit): string {
    const params = new URLSearchParams(hit.query);
    return [hit.fn, params.get('tenantId'), params.get('personId'), params.get('key'), params.get('detailed')].join('|');
  }

  private linkFor(hit: LegacyIcalHit): string {
    return `${environment.apiUrl}/functions/v1/${hit.fn}?${hit.query}`;
  }

  private async showNotice(hits: LegacyIcalHit[]): Promise<void> {
    const links = hits.map((h) => this.linkFor(h));
    const copy = (link: string) => {
      navigator?.clipboard?.writeText(link);
      Utils.showToast(translate('settings.linkCopied'), 'success');
      return false;
    };
    const copyButtons = links.length === 1
      ? [{ text: translate('settings.copyLink'), handler: () => copy(links[0]) }]
      : links.map((link, i) => ({ text: translate('icalMigration.copyLinkN', { n: i + 1 }), handler: () => copy(link) }));
    const alert = await this.alertController.create({
      header: translate('icalMigration.header'),
      message: links.length === 1
        ? translate('icalMigration.message', { link: links[0] })
        : translate('icalMigration.messageMultiple', { links: links.map((l, i) => `${i + 1}. ${l}`).join('\n\n') }),
      backdropDismiss: false,
      buttons: [
        ...copyButtons,
        {
          text: translate('settings.openGuide'),
          handler: () => {
            Browser.open({ url: isPlatform('ios') ? 'https://support.apple.com/de-de/102301' : 'https://support.google.com/calendar/answer/37100?hl=de&co=GENIE.Platform%3DAndroid' });
            return false;
          },
        },
        {
          text: translate('icalMigration.done'),
          handler: () => this.saveDismissed(hits.map((h) => this.hitId(h))),
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

  private saveDismissed(ids: string[]): void {
    try {
      const all = this.readDismissed();
      for (const id of ids) all[id] = Date.now();
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(all));
    } catch {
      // Storage blocked: the notice simply shows again next time.
    }
  }
}
