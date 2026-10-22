import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { AdministrationPageRoutingModule } from './administration-routing.module';
import { AdministrationPage } from './administration.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AdministrationPageRoutingModule,
  ],
  declarations: [AdministrationPage]
})
export class AdministrationPageModule {}
