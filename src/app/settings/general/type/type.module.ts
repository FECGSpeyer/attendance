import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TypePageRoutingModule } from './type-routing.module';

import { TypePage } from './type.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TypePageRoutingModule
  ],
  declarations: [TypePage]
})
export class TypePageModule {}
