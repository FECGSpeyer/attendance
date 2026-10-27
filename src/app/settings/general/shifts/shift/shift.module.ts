import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { ShiftPageRoutingModule } from './shift-routing.module';

import { ShiftPage } from './shift.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    ShiftPageRoutingModule
  ],
  declarations: [ShiftPage]
})
export class ShiftPageModule {}
