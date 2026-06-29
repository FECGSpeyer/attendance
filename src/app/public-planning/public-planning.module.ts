import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PublicPlanningPageRoutingModule } from './public-planning-routing.module';

import { PublicPlanningPage } from './public-planning.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PublicPlanningPageRoutingModule
  ],
  declarations: [PublicPlanningPage]
})
export class PublicPlanningPageModule {}
