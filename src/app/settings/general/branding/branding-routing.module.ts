import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BrandingPage } from './branding.page';

const routes: Routes = [
  {
    path: '',
    component: BrandingPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BrandingPageRoutingModule {}
