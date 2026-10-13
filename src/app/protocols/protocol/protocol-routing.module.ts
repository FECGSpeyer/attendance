import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ProtocolPage } from './protocol.page';

const routes: Routes = [
  // attendanceId comes from the parent route (tabs: attendance/:attendanceId/protocol).
  { path: '', component: ProtocolPage }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProtocolPageRoutingModule {}
