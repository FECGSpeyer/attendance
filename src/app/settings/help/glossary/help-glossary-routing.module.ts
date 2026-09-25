import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HelpGlossaryPage } from './help-glossary.page';

const routes: Routes = [
  {
    path: '',
    component: HelpGlossaryPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HelpGlossaryPageRoutingModule {}
