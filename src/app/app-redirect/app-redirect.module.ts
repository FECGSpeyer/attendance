import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular';

import { AppRedirectPageRoutingModule } from './app-redirect-routing.module';
import { AppRedirectPage } from './app-redirect.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    AppRedirectPageRoutingModule,
  ],
  declarations: [AppRedirectPage],
})
export class AppRedirectModule {}
