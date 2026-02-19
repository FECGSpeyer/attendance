import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { VoiceLeaderPageRoutingModule } from './voice-leader-routing.module';

import { VoiceLeaderPage } from './voice-leader.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    VoiceLeaderPageRoutingModule
  ],
  declarations: [VoiceLeaderPage]
})
export class VoiceLeaderPageModule {}
