import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BulkEditPage } from './bulk-edit.page';

const routes: Routes = [
  {
    path: '',
    component: BulkEditPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BulkEditPageRoutingModule {}
