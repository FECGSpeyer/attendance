import { Component, effect } from '@angular/core';
import { DbService } from '../services/db.service';
import { Role } from '../utilities/constants';
import { registeredEffect, registerTabBarEffect } from '@rdlabo/ionic-theme-ios26';
import { Utils } from 'src/app/utilities/Utils';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss']
})
export class TabsPage {
  public isConductor: boolean = false;
  public isHelper: boolean = false;
  public isParent: boolean = false;
  readonly registeredGestures: registeredEffect[] = [];

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

    effect(() => {
      this.isConductor = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.VIEWER || this.db.tenantUser().role === Role.RESPONSIBLE;
      this.isHelper = this.db.tenantUser().role === Role.HELPER;

      const url: string = Utils.getUrl(this.db.tenantUser().role);
      if (this.router.url !== url && !Utils.isUrlAccessAllowed(this.router.url, this.db.tenantUser().role)) {
        this.router.navigateByUrl(url);
      }
    });
  }

  ionViewDidEnter() {
    const registerGesture = registerTabBarEffect(document.querySelector<HTMLElement>('ion-tab-bar')!);
    if (registerGesture) {
      this.registeredGestures.push(registerGesture);
    }
  }

  ionViewDidLeave() {
    this.registeredGestures.forEach((gesture) => gesture.destroy());
  }

}
