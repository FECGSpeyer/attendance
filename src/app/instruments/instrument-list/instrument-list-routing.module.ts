import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { InstrumentListPage } from './instrument-list.page';

const routes: Routes = [
  {
    path: '',
    component: InstrumentListPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InstrumentListPageRoutingModule {}
