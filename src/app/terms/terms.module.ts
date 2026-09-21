import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { TermsPageRoutingModule } from './terms-routing.module';
import { TermsPage } from './terms.page';
import { LegalModalComponent } from '../login/legal-modal/legal-modal.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TermsPageRoutingModule,
    LegalModalComponent
  ],
  declarations: [TermsPage]
})
export class TermsPageModule {}
