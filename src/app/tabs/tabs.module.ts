import { IonicModule } from '@ionic/angular/lazy';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TabsPageRoutingModule } from './tabs-routing.module';

import { TabsPage } from './tabs.page';
import { AudioPlayerComponent } from '../shared/audio-player/audio-player.component';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    IonicModule,
    CommonModule,
    FormsModule,
    TabsPageRoutingModule,
    AudioPlayerComponent,
  ],
  declarations: [TabsPage]
})
export class TabsPageModule {}
