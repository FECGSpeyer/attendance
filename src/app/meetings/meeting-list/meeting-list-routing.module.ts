import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MeetingListPage } from './meeting-list.page';

const routes: Routes = [
  {
    path: '',
    component: MeetingListPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MeetingListPageRoutingModule {}
