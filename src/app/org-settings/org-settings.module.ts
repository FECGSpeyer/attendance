import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { OrgSettingsPageRoutingModule } from './org-settings-routing.module';
import { OrgSettingsPage } from './org-settings.page';
import { LinkPersonsPageModule } from '../settings/general/link-persons/link-persons.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    OrgSettingsPageRoutingModule,
    LinkPersonsPageModule,
  ],
  declarations: [OrgSettingsPage],
})
export class OrgSettingsPageModule {}
