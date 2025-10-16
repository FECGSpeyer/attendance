import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { HandoverDetailPageRoutingModule } from './handover-detail-routing.module';

import { HandoverDetailPage } from './handover-detail.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HandoverDetailPageRoutingModule
  ],
  declarations: [HandoverDetailPage]
})
export class HandoverDetailPageModule {}
