import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MeetingPageRoutingModule } from './meeting-routing.module';

import { MeetingPage } from './meeting.page';
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
    MeetingPageRoutingModule,
  ],
  declarations: [MeetingPage]
})
export class MeetingPageModule { }
