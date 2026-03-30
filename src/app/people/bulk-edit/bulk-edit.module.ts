import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { BulkEditPageRoutingModule } from './bulk-edit-routing.module';

import { BulkEditPage } from './bulk-edit.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    BulkEditPageRoutingModule
  ],
  declarations: [BulkEditPage]
})
export class BulkEditPageModule {}
