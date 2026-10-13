import { Component, ElementRef, effect } from '@angular/core';
import { DbService } from '../services/db.service';
import { Role } from '../utilities/constants';
import { registeredEffect, registerTabBarEffect } from '@rdlabo/ionic-theme-ios27';
import { Utils } from 'src/app/utilities/Utils';
import { Router } from '@angular/router';

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
  readonly registeredGestures: registeredEffect[] = [];

  constructor(
    private db: DbService,
    private router: Router,
    private el: ElementRef<HTMLElement>
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

  ionViewDidEnter() {
    // Only ever one effect on this page's own tab bar: a second registration
    // (or one on a stale tab bar from a previous TabsPage) fights over taps.
    this.destroyGestures();
    const tabBar = this.el.nativeElement.querySelector<HTMLElement>('ion-tab-bar');
    const registerGesture = tabBar ? registerTabBarEffect(tabBar) : undefined;
    if (registerGesture) {
      this.registeredGestures.push(registerGesture);
    }
  }

  ionViewDidLeave() {
    this.destroyGestures();
  }

  private destroyGestures() {
    this.registeredGestures.forEach((gesture) => gesture.destroy());
    this.registeredGestures.length = 0;
  }

}
