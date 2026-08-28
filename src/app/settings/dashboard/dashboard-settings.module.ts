import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { DashboardSettingsPageRoutingModule } from './dashboard-settings-routing.module';
import { DashboardSettingsPage } from './dashboard-settings.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DashboardSettingsPageRoutingModule,
  ],
  declarations: [DashboardSettingsPage]
})
export class DashboardSettingsPageModule {}
