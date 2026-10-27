import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular/lazy';

import { AppRedirectPageRoutingModule } from './app-redirect-routing.module';
import { AppRedirectPage } from './app-redirect.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    IonicModule,
    AppRedirectPageRoutingModule,
  ],
  declarations: [AppRedirectPage],
})
export class AppRedirectModule {}
