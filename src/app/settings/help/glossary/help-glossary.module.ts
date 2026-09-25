import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { HelpGlossaryPageRoutingModule } from './help-glossary-routing.module';

import { HelpGlossaryPage } from './help-glossary.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HelpGlossaryPageRoutingModule,
  ],
  declarations: [HelpGlossaryPage]
})
export class HelpGlossaryPageModule {}
