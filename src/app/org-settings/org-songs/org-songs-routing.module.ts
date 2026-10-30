import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { OrgSongsPage } from './org-songs.page';

const routes: Routes = [{ path: '', component: OrgSongsPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrgSongsPageRoutingModule {}
