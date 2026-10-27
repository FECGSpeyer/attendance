import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { VoiceLeaderPageRoutingModule } from './voice-leader-routing.module';

import { VoiceLeaderPage } from './voice-leader.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    VoiceLeaderPageRoutingModule
  ],
  declarations: [VoiceLeaderPage]
})
export class VoiceLeaderPageModule {}
