import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { ExtraFieldsPageRoutingModule } from './extra-fields-routing.module';

import { ExtraFieldsPage } from './extra-fields.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    ExtraFieldsPageRoutingModule
  ],
  declarations: [ExtraFieldsPage]
})
export class ExtraFieldsPageModule {}
