import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ShiftsPage } from './shifts.page';

const routes: Routes = [
  {
    path: '',
    component: ShiftsPage
  },
  {
    path: ':id',
    loadChildren: () => import('./shift/shift.module').then( m => m.ShiftPageModule)
  }

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ShiftsPageRoutingModule {}
