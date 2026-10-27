import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { SharedPlanPageRoutingModule } from './shared-plan-routing.module';
import { SharedPlanPage } from './shared-plan.page';
import { PlanChipsComponent } from '../planning/plan-chips/plan-chips.component';
import { PlanMinutesPipe } from '../planning/plan-minutes.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    SharedPlanPageRoutingModule,
    PlanChipsComponent,
    PlanMinutesPipe,
  ],
  declarations: [SharedPlanPage]
})
export class SharedPlanPageModule {}
