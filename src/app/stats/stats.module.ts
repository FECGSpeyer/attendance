import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';
import { BaseChartDirective } from 'ng2-charts';

import { StatsPageRoutingModule } from './stats-routing.module';

import { StatsPage } from './stats.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    StatsPageRoutingModule,
    BaseChartDirective
  ],
  declarations: [StatsPage]
})
export class StatsPageModule { }
