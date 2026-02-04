import { Component, effect } from '@angular/core';
import { DbService } from '../services/db.service';
import { Role } from '../utilities/constants';
// Disabled due to swipe-back double navigation bug
// import { registeredEffect, registerTabBarEffect } from '@rdlabo/ionic-theme-ios26';
import { Utils } from 'src/app/utilities/Utils';
import { Router } from '@angular/router';

@Component({
    selector: 'app-tabs',
    templateUrl: 'tabs.page.html',
    styleUrls: ['tabs.page.scss'],
    standalone: false
})
export class TabsPage {
  public isConductor: boolean = false;
  public isHelper: boolean = false;
  public isParent: boolean = false;
  public isPlayer: boolean = false;
  public hasMultipleTenants: boolean = false;
  // readonly registeredGestures: registeredEffect[] = [];

  constructor(
    private db: DbService,
    private router: Router
  ) {
    this.initialize();
  }

  initialize() {
    this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.VIEWER || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.isHelper = this.db.tenantUser().role === Role.HELPER;
    this.isParent = this.db.tenantUser().role === Role.PARENT;
    this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
    this.hasMultipleTenants = (this.db.tenants()?.length || 0) > 1;

    effect(() => {
      this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.VIEWER || this.db.tenantUser().role === Role.RESPONSIBLE;
      this.isHelper = this.db.tenantUser().role === Role.HELPER;
      this.isPlayer = this.db.tenantUser().role === Role.PLAYER || this.db.tenantUser().role === Role.NONE;
      this.hasMultipleTenants = (this.db.tenants()?.length || 0) > 1;

      const url: string = Utils.getUrl(this.db.tenantUser().role);
      if (this.router.url !== url && !Utils.isUrlAccessAllowed(this.router.url, this.db.tenantUser().role)) {
        this.router.navigateByUrl(url);
      }
    });
  }

  // Disabled due to swipe-back double navigation bug
  // ionViewDidEnter() {
  //   const registerGesture = registerTabBarEffect(document.querySelector<HTMLElement>('ion-tab-bar')!);
  //   if (registerGesture) {
  //     this.registeredGestures.push(registerGesture);
  //   }
  // }

  // ionViewDidLeave() {
  //   this.registeredGestures.forEach((gesture) => gesture.destroy());
  // }

}
