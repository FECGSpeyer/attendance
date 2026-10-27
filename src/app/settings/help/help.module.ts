import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { HelpPageRoutingModule } from './help-routing.module';

import { HelpPage } from './help.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    HelpPageRoutingModule,
  ],
  declarations: [HelpPage]
})
export class HelpPageModule {}
