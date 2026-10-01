import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AgendaItemListPage } from './agenda-item-list.page';

const routes: Routes = [
  { path: '', component: AgendaItemListPage }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AgendaItemListPageRoutingModule {}
