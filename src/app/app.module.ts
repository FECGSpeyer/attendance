import { APP_INITIALIZER, NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicStorageModule } from '@ionic/storage-angular';
import { ServiceWorkerModule } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';

import { IonicModule, IonicRouteStrategy, isPlatform } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios26';
import { AuthService } from './services/auth/auth.service';
import { TeamsService, isInIframe } from './services/teams/teams.service';

function initAuth(authSvc: AuthService) {
  return () => authSvc.sessionReady;
}

function initTeams(teamsSvc: TeamsService) {
  return () => teamsSvc.init();
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot({
      // iosTransitionAnimation disabled - causes double-back on swipe gesture
      popoverEnter: isPlatform('ios') ? popoverEnterAnimation : undefined,
      popoverLeave: isPlatform('ios') ? popoverLeaveAnimation : undefined,
      swipeBackEnabled: false,
    }),
    AppRoutingModule,
    IonicStorageModule.forRoot(),
    ServiceWorkerModule.register('ngsw-worker.js', {
      // Disabled inside an iframe (Teams tab): the SW caches index.html along
      // with its response headers (incl. CSP frame-ancestors), which would pin
      // a stale policy and break framing after a redeploy. It also gives no
      // offline benefit in an embedded host.
      enabled: !isDevMode() && !Capacitor.isNativePlatform() && !isInIframe(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: APP_INITIALIZER, useFactory: initTeams, deps: [TeamsService], multi: true },
    { provide: APP_INITIALIZER, useFactory: initAuth, deps: [AuthService], multi: true },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
