import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { SongImportPageRoutingModule } from './import-routing.module';

import { SongImportPage } from './import.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SongImportPageRoutingModule
  ],
  declarations: [SongImportPage]
})
export class SongImportPageModule {}
