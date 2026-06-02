import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AppRedirectPage } from './app-redirect.page';

const routes: Routes = [
  {
    path: '',
    component: AppRedirectPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AppRedirectPageRoutingModule {}
