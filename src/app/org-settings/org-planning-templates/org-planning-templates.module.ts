import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { OrgPlanningTemplatesPage } from './org-planning-templates.page';
import { OrgPlanningTemplatesPageRoutingModule } from './org-planning-templates-routing.module';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    OrgPlanningTemplatesPageRoutingModule,
  ],
  declarations: [OrgPlanningTemplatesPage],
})
export class OrgPlanningTemplatesPageModule {}
