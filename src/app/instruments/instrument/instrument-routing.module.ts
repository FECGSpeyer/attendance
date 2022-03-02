import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { InstrumentPage } from './instrument.page';

const routes: Routes = [
  {
    path: '',
    component: InstrumentPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InstrumentPageRoutingModule {}
