import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedPlanPage } from './shared-plan.page';

const routes: Routes = [
  { path: '', component: SharedPlanPage }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SharedPlanPageRoutingModule {}
