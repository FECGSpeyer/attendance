import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SongsPage } from './songs.page';

const routes: Routes = [
  {
    path: '',
    component: SongsPage
  },
  {
    path: 'import',
    loadChildren: () => import('./import/import.module').then(m => m.SongImportPageModule),
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SongsPageRoutingModule {}
