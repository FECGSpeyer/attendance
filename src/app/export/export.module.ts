import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { ExportPageRoutingModule } from './export-routing.module';

import { ExportPage } from './export.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    ExportPageRoutingModule
  ],
  declarations: [ExportPage]
})
export class ExportPageModule {}
