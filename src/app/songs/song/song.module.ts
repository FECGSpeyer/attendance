import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { SongPageRoutingModule } from './song-routing.module';

import { SongPage } from './song.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SongPageRoutingModule
  ],
  declarations: [SongPage]
})
export class SongPageModule {}
