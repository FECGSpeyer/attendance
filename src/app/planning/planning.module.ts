import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { PlanningPageRoutingModule } from './planning-routing.module';

import { PlanningPage } from './planning.page';
import { PlanChipsComponent } from './plan-chips/plan-chips.component';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    PlanningPageRoutingModule,
    PlanChipsComponent,
  ],
  declarations: [PlanningPage]
})
export class PlanningPageModule {}
