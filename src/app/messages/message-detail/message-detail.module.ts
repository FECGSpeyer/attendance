import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { MessageDetailPageRoutingModule } from './message-detail-routing.module';
import { MessageDetailPage } from './message-detail.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    MessageDetailPageRoutingModule,
  ],
  declarations: [MessageDetailPage]
})
export class MessageDetailPageModule { }
