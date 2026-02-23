import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SettingsPageRoutingModule } from './settings-routing.module';

import { SettingsPage } from './settings.page';
import { HistoryPageModule } from 'src/app/history/history.module';
import { StatsPageModule } from 'src/app/stats/stats.module';
import { ExportPageModule } from 'src/app/export/export.module';
import { PlanningPageModule } from 'src/app/planning/planning.module';
import { PersonPageModule } from 'src/app/people/person/person.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SettingsPageRoutingModule,
    HistoryPageModule,
    StatsPageModule,
    ExportPageModule,
    PlanningPageModule,
    PersonPageModule
  ],
  declarations: [SettingsPage]
})
export class SettingsPageModule {}
