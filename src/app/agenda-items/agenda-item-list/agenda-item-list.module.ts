import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { AgendaItemListPageRoutingModule } from './agenda-item-list-routing.module';
import { AgendaItemListPage } from './agenda-item-list.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AgendaItemListPageRoutingModule,
  ],
  declarations: [AgendaItemListPage]
})
export class AgendaItemListPageModule {}
