import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SongViewerPage } from './song-viewer.page';

const routes: Routes = [
  {
    path: '',
    component: SongViewerPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SongViewerPageRoutingModule {}
