import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ProblemModalPageRoutingModule } from './problem-modal-routing.module';

import { ProblemModalPage } from './problem-modal.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ProblemModalPageRoutingModule
  ],
  declarations: [ProblemModalPage]
})
export class ProblemModalPageModule {}
