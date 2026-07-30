import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TeamsConfigPageRoutingModule } from './teams-config-routing.module';
import { TeamsConfigPage } from './teams-config.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TeamsConfigPageRoutingModule,
  ],
  declarations: [TeamsConfigPage],
})
export class TeamsConfigModule {}
