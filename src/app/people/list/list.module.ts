import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ListPageRoutingModule } from './list-routing.module';

import { ListPage } from './list.page';
import { PersonPageModule } from '../person/person.module';
import { BulkEditPageModule } from '../bulk-edit/bulk-edit.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ListPageRoutingModule,
    PersonPageModule,
    BulkEditPageModule
  ],
  declarations: [ListPage]
})
export class ListPageModule {}
