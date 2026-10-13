import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { MessageListPageRoutingModule } from './message-list-routing.module';
import { MessageListPage } from './message-list.page';
import { MessageComposeComponent } from '../message-compose/message-compose.component';
import { MessageEditorComponent } from 'src/app/shared/message-editor/message-editor.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MessageListPageRoutingModule,
    MessageEditorComponent,
  ],
  declarations: [MessageListPage, MessageComposeComponent]
})
export class MessageListPageModule { }
