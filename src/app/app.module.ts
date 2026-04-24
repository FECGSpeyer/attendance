import { APP_INITIALIZER, NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicStorageModule } from '@ionic/storage-angular';
import { ServiceWorkerModule } from '@angular/service-worker';

import { IonicModule, IonicRouteStrategy, isPlatform } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { popoverEnterAnimation, popoverLeaveAnimation } from '@rdlabo/ionic-theme-ios26';
import { AuthService } from './services/auth/auth.service';

function initAuth(authSvc: AuthService) {
  return () => authSvc.sessionReady;
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
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: APP_INITIALIZER, useFactory: initAuth, deps: [AuthService], multi: true },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
