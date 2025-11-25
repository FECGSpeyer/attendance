import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ShiftPage } from './shift.page';

const routes: Routes = [
  {
    path: '',
    component: ShiftPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ShiftPageRoutingModule {}
