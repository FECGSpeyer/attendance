import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { OrgPlansPageRoutingModule } from './org-plans-routing.module';
import { OrgPlansPage } from './org-plans.page';
import { PlanViewerComponent } from '../planning/plan-viewer/plan-viewer.component';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    OrgPlansPageRoutingModule,
    PlanViewerComponent,
  ],
  declarations: [OrgPlansPage],
})
export class OrgPlansPageModule {}
