import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { TenantRegisterPageRoutingModule } from './tenant-register-routing.module';

import { TenantRegisterPage } from './tenant-register.page';
import { LegalModalComponent } from 'src/app/login/legal-modal/legal-modal.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TenantRegisterPageRoutingModule,
    LegalModalComponent
  ],
  declarations: [TenantRegisterPage]
})
export class TenantRegisterPageModule {}
