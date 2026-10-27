import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { ShiftsPageRoutingModule } from './shifts-routing.module';

import { ShiftsPage } from './shifts.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    ShiftsPageRoutingModule
  ],
  declarations: [ShiftsPage]
})
export class ShiftsPageModule {}
