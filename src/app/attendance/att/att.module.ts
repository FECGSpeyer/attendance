import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AttPageRoutingModule } from './att-routing.module';

import { AttPage } from './att.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AttPageRoutingModule
  ],
  declarations: [AttPage]
})
export class AttPageModule {}
