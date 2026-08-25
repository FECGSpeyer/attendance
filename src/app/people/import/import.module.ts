import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { ImportPageRoutingModule } from './import-routing.module';

import { ImportPage } from './import.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ImportPageRoutingModule
  ],
  declarations: [ImportPage]
})
export class ImportPageModule {}
