import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { AdministrationPageRoutingModule } from './administration-routing.module';
import { AdministrationPage } from './administration.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    AdministrationPageRoutingModule,
  ],
  declarations: [AdministrationPage]
})
export class AdministrationPageModule {}
