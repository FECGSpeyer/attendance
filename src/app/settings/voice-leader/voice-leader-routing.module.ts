import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { VoiceLeaderPage } from './voice-leader.page';

const routes: Routes = [
  {
    path: '',
    component: VoiceLeaderPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class VoiceLeaderPageRoutingModule {}
