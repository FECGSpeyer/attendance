import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { QuillModule } from 'ngx-quill';

import { OverviewPageRoutingModule } from './overview-routing.module';

import { OverviewPage } from './overview.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    OverviewPageRoutingModule,
    QuillModule.forRoot(),
  ],
  declarations: [OverviewPage]
})
export class OverviewPageModule {}
