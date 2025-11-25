import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ShiftPageRoutingModule } from './shift-routing.module';

import { ShiftPage } from './shift.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ShiftPageRoutingModule
  ],
  declarations: [ShiftPage]
})
export class ShiftPageModule {}
