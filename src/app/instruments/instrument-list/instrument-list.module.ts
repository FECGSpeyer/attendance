import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { InstrumentListPageRoutingModule } from './instrument-list-routing.module';

import { InstrumentListPage } from './instrument-list.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    InstrumentListPageRoutingModule
  ],
  declarations: [InstrumentListPage]
})
export class InstrumentListPageModule {}
