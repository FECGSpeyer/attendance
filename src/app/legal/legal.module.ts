import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { LegalPageRoutingModule } from './legal-routing.module';
import { LegalPage } from './legal.page';
import { LegalContentComponent } from '../login/legal-modal/legal-content.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LegalPageRoutingModule,
    LegalContentComponent
  ],
  declarations: [LegalPage]
})
export class LegalPageModule {}
