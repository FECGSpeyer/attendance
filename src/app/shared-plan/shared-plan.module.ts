import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { SharedPlanPageRoutingModule } from './shared-plan-routing.module';
import { SharedPlanPage } from './shared-plan.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedPlanPageRoutingModule
  ],
  declarations: [SharedPlanPage]
})
export class SharedPlanPageModule {}
