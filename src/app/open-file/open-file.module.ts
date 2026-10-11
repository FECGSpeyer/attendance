import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular/lazy';

import { OpenFilePageRoutingModule } from './open-file-routing.module';
import { OpenFilePage } from './open-file.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    OpenFilePageRoutingModule,
  ],
  declarations: [OpenFilePage],
})
export class OpenFileModule {}
