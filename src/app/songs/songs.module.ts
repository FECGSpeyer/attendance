import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { SongsPageRoutingModule } from './songs-routing.module';
import { SongImportPageModule } from './import/import.module';

import { SongsPage } from './songs.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    SongsPageRoutingModule,
    SongImportPageModule,
  ],
  declarations: [SongsPage]
})
export class SongsPageModule {}
