import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TypesPageRoutingModule } from './types-routing.module';

import { TypesPage } from './types.page';
import { TypePageModule } from '../type/type.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TypesPageRoutingModule,
    TypePageModule
  ],
  declarations: [TypesPage]
})
export class TypesPageModule {}
