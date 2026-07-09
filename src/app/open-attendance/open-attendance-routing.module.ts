import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { OpenAttendancePage } from './open-attendance.page';

const routes: Routes = [
  {
    path: '',
    component: OpenAttendancePage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OpenAttendancePageRoutingModule {}
