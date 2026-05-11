import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { QuillModule } from 'ngx-quill';

import { SignoutPageRoutingModule } from './signout-routing.module';

import { SignoutPage } from './signout.page';
import { PlanViewerComponent } from 'src/app/planning/plan-viewer/plan-viewer.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SignoutPageRoutingModule,
    PlanViewerComponent,
    QuillModule.forRoot(),
  ],
  declarations: [SignoutPage]
})
export class SignoutPageModule {}
