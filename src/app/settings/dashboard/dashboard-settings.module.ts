import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { DashboardSettingsPageRoutingModule } from './dashboard-settings-routing.module';
import { DashboardSettingsPage } from './dashboard-settings.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    DashboardSettingsPageRoutingModule,
  ],
  declarations: [DashboardSettingsPage]
})
export class DashboardSettingsPageModule {}
