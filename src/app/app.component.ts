import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { DbService } from './services/db.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
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
  }
}
