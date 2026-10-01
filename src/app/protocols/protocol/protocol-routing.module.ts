import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ProtocolPage } from './protocol.page';

const routes: Routes = [
  { path: ':attendanceId', component: ProtocolPage }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProtocolPageRoutingModule {}
