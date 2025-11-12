import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SongViewerPageRoutingModule } from './song-viewer-routing.module';

import { SongViewerPage } from './song-viewer.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SongViewerPageRoutingModule
  ],
  declarations: [SongViewerPage]
})
export class SongViewerPageModule {}
