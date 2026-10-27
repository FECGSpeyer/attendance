import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { InstrumentListPageRoutingModule } from './instrument-list-routing.module';

import { InstrumentListPage } from './instrument-list.page';
import { InstrumentPageModule } from '../instrument/instrument.module';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    InstrumentListPageRoutingModule,
    InstrumentPageModule
  ],
  declarations: [InstrumentListPage]
})
export class InstrumentListPageModule {}
