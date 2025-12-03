import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { TenantRegisterPage } from './tenant-register.page';

const routes: Routes = [
  {
    path: '',
    component: TenantRegisterPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TenantRegisterPageRoutingModule {}
