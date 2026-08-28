import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ExtraFieldsPage } from './extra-fields.page';

const routes: Routes = [
  {
    path: '',
    component: ExtraFieldsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ExtraFieldsPageRoutingModule {}
