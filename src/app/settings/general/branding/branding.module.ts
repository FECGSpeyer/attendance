import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { BrandingPageRoutingModule } from './branding-routing.module';

import { BrandingPage } from './branding.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    BrandingPageRoutingModule
  ],
  declarations: [BrandingPage]
})
export class BrandingPageModule {}
