import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { BrandingPageRoutingModule } from './branding-routing.module';

import { BrandingPage } from './branding.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    BrandingPageRoutingModule
  ],
  declarations: [BrandingPage]
})
export class BrandingPageModule {}
