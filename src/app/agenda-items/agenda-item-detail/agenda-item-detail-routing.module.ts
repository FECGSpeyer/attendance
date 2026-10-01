import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AgendaItemDetailPage } from './agenda-item-detail.page';

const routes: Routes = [
  { path: '', component: AgendaItemDetailPage }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AgendaItemDetailPageRoutingModule {}
