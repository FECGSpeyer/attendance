import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';
import { OrgPlanPublicPageRoutingModule } from './org-plan-public-routing.module';
import { OrgPlanPublicPage } from './org-plan-public.page';
import { PlanMinutesPipe } from '../planning/plan-minutes.pipe';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    OrgPlanPublicPageRoutingModule,
    PlanMinutesPipe,
  ],
  declarations: [OrgPlanPublicPage],
})
export class OrgPlanPublicPageModule {}
