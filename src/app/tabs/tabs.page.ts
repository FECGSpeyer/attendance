import { Component, ViewChild, effect } from '@angular/core';
import { Location } from '@angular/common';
import { IonTabs, NavController } from '@ionic/angular/lazy';
import { DbService } from '../services/db.service';
import { Role } from '../utilities/constants';
import { Utils } from 'src/app/utilities/Utils';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router } from '@angular/router';
import { TrackingEvent, TrackingService } from '../services/tracking/tracking.service';

// Zeit, nach der ein Tab-Tipp ohne abgeschlossene Navigation als hängend gilt.
const TAB_NAV_TIMEOUT_MS = 800;

@Component({
    selector: 'app-tabs',
    templateUrl: 'tabs.page.html',
    styleUrls: ['tabs.page.scss'],
    standalone: false
})
export class TabsPage {
  public isConductor = false;
  public isHelper = false;
  public isParent = false;
  public isPlayer = false;
  public showMembersTab = false;
  public showSongsTab = false;
  public showOrgPlansTab = false;
  public showDashboardTab = false;
  public hasMultipleTenants = false;

  @ViewChild(IonTabs) private ionTabs?: IonTabs;

  constructor(
    private db: DbService,
    private router: Router,
    private location: Location,
    private navCtrl: NavController,
    private tracking: TrackingService,
  ) {
    this.initialize();
  }

  initialize() {
    this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.VIEWER || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER || this.db.tenantUser().role === Role.VOICE_LEADER_HELPER;
    this.isParent = this.db.tenantUser().role === Role.PARENT;
    this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
    this.showMembersTab = [Role.HELPER, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER, Role.PLAYER, Role.NONE].includes(this.db.tenantUser().role) && this.db.tenant()?.showMembersList === true;
    this.showSongsTab = this.db.showSongsTabSignal() && this.db.tenant()?.type !== 'general' && this.db.tenantUser().role !== Role.APPLICANT;
    this.showOrgPlansTab = this.db.showOrgPlansTabSignal() && !!this.db.organisation() && [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser().role);
    this.showDashboardTab = this.db.showDashboardTabSignal() && [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser().role);
    this.hasMultipleTenants = (this.db.tenants()?.length || 0) > 1;

    effect(() => {
      this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.VIEWER || this.db.tenantUser().role === Role.RESPONSIBLE;
      this.isHelper = this.db.tenantUser().role === Role.HELPER || this.db.tenantUser().role === Role.VOICE_LEADER_HELPER;
      this.isParent = this.db.tenantUser().role === Role.PARENT;
      this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
      this.showMembersTab = [Role.HELPER, Role.VOICE_LEADER, Role.VOICE_LEADER_HELPER, Role.PLAYER, Role.NONE].includes(this.db.tenantUser().role) && this.db.tenant()?.showMembersList === true;
      this.showSongsTab = this.db.showSongsTabSignal() && this.db.tenant()?.type !== 'general' && this.db.tenantUser().role !== Role.APPLICANT;
      this.showOrgPlansTab = this.db.showOrgPlansTabSignal() && !!this.db.organisation() && [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser().role);
      this.showDashboardTab = this.db.showDashboardTabSignal() && [Role.ADMIN, Role.RESPONSIBLE].includes(this.db.tenantUser().role);
      this.hasMultipleTenants = (this.db.tenants()?.length || 0) > 1;

      const url: string = Utils.getUrl(this.db.tenantUser().role);
      // Dateiablage: Zugriff hängt an canAccessFiles() (u. a. freigegebene
      // Instanzen) und Direktlinks tragen Query-Params (?path=…&open=…).
      const path = this.router.url.split('?')[0];
      const isFilesUrl = (path === '/tabs/settings/files' && this.db.canAccessFiles()) || path === '/open-file';
      if (this.router.url !== url && !isFilesUrl && !Utils.isUrlAccessAllowed(this.router.url, this.db.tenantUser().role)) {
        this.router.navigateByUrl(url);
      }
    });
  }

  /**
   * Auf iOS kam es vor, dass ein Tipp auf einen Tab zwar ankommt, die
   * Navigation aber nie abgeschlossen wird. Läuft innerhalb kurzer Zeit keine
   * Navigation durch, wird der Zustand protokolliert (usage_events
   * `tab_nav_stuck`) und die Navigation direkt nachgeholt.
   */
  onTabButtonClick(ev: Event): void {
    const tab = (ev as CustomEvent<{ tab?: string }>).detail?.tab;
    if (!tab) {
      return;
    }

    const outlet = this.ionTabs?.outlet;
    // Erneuter Tipp auf den aktiven Tab navigiert bewusst nicht immer.
    if (outlet?.getActiveStackId() === tab) {
      return;
    }
    const lastUrl = outlet?.getLastRouteView(tab)?.url;
    const info = {
      tab,
      routerUrl: this.router.url,
      locationPath: this.location.path(),
      activeStack: outlet?.getActiveStackId(),
      lastUrl,
    };
    const events: string[] = [];
    let ended = false;
    const sub = this.router.events.subscribe(e => {
      if (e instanceof NavigationStart) {
        events.push(`start ${e.url}`);
      } else if (e instanceof NavigationEnd) {
        ended = true;
        events.push(`end ${e.urlAfterRedirects}`);
      } else if (e instanceof NavigationCancel) {
        events.push(`cancel ${e.code} ${e.reason}`);
      } else if (e instanceof NavigationSkipped) {
        events.push(`skipped ${e.code} ${e.reason}`);
      } else if (e instanceof NavigationError) {
        events.push(`error ${e.error?.message ?? e.error}`);
      }
    });

    setTimeout(() => {
      sub.unsubscribe();
      if (ended || this.router.getCurrentNavigation()) {
        return;
      }

      const target = lastUrl || `/tabs/${tab}`;
      this.tracking.track(TrackingEvent.TabNavStuck, { ...info, events, afterUrl: this.router.url });

      let fallbackEnded = false;
      const fallbackSub = this.router.events.subscribe(e => {
        if (e instanceof NavigationEnd) {
          fallbackEnded = true;
        }
      });
      this.navCtrl.navigateRoot(target, {
        animated: true,
        animationDirection: 'back',
        onSameUrlNavigation: 'reload',
      }).catch(() => undefined);
      setTimeout(() => {
        fallbackSub.unsubscribe();
        this.tracking.track(TrackingEvent.TabNavFallback, { tab, target, ok: fallbackEnded, afterUrl: this.router.url });
      }, TAB_NAV_TIMEOUT_MS);
    }, TAB_NAV_TIMEOUT_MS);
  }
}
