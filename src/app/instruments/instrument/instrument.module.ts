import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { InstrumentPageRoutingModule } from './instrument-routing.module';

import { InstrumentPage } from './instrument.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    InstrumentPageRoutingModule
  ],
  declarations: [InstrumentPage]
})
export class InstrumentPageModule {}
