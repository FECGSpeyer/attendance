import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { BulkEditPageRoutingModule } from './bulk-edit-routing.module';

import { BulkEditPage } from './bulk-edit.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    BulkEditPageRoutingModule
  ],
  declarations: [BulkEditPage]
})
export class BulkEditPageModule {}
