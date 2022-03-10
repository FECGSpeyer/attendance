import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonRouterOutlet, Platform } from '@ionic/angular';
import { DbService } from './services/db.service';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  @ViewChild(IonRouterOutlet, { static: true }) routerOutlet: IonRouterOutlet;

  constructor(
    private platform: Platform,
    private db: DbService,
    private router: Router,
  ) {
    this.initializeApp();
  }

  initializeApp() {
    this.platform.ready().then(() => {
      this.db.authenticationState.subscribe(state => {
        if (state.isConductor) {
          this.router.navigate(['tabs', 'player']);
        } else if (state.isPlayer) {
          this.router.navigate(['tabs', 'attendance']);
        } else {
          this.router.navigate(['login']);
        }
      });
    });

    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (!this.routerOutlet.canGoBack()) {
        App.exitApp();
      }
    });
  }
}
