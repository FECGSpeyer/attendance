import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TenantRegisterPageRoutingModule } from './tenant-register-routing.module';

import { TenantRegisterPage } from './tenant-register.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TenantRegisterPageRoutingModule
  ],
  declarations: [TenantRegisterPage]
})
export class TenantRegisterPageModule {}
