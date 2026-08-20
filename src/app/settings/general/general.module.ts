import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { GeneralPageRoutingModule } from './general-routing.module';

import { GeneralPage } from './general.page';
import { LinkPersonsPageModule } from './link-persons/link-persons.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    GeneralPageRoutingModule,
    LinkPersonsPageModule,
  ],
  declarations: [GeneralPage]
})
export class GeneralPageModule {}
