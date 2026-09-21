import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { AgendaItemDetailPageRoutingModule } from './agenda-item-detail-routing.module';
import { AgendaItemDetailPage } from './agenda-item-detail.page';
import { QuillModule } from 'ngx-quill';

@NgModule({
  imports: [
    QuillModule.forRoot({
      modules: {
        syntax: true
      }
    }),
    CommonModule,
    FormsModule,
    IonicModule,
    AgendaItemDetailPageRoutingModule,
  ],
  declarations: [AgendaItemDetailPage]
})
export class AgendaItemDetailPageModule {}
