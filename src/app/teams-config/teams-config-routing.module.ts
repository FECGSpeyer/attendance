import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TeamsConfigPage } from './teams-config.page';

const routes: Routes = [
  {
    path: '',
    component: TeamsConfigPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TeamsConfigPageRoutingModule {}
