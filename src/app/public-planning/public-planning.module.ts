import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { PublicPlanningPageRoutingModule } from './public-planning-routing.module';

import { PublicPlanningPage } from './public-planning.page';
import { MyPlansComponent } from './my-plans/my-plans.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PublicPlanningPageRoutingModule
  ],
  declarations: [PublicPlanningPage, MyPlansComponent]
})
export class PublicPlanningPageModule {}
