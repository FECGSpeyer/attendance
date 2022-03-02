import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AttListPage } from './att-list.page';

const routes: Routes = [
  {
    path: '',
    component: AttListPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AttListPageRoutingModule {}
