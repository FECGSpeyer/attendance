import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { TaskDetailPageRoutingModule } from './task-detail-routing.module';
import { TaskDetailPage } from './task-detail.page';
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
    TaskDetailPageRoutingModule,
  ],
  declarations: [TaskDetailPage]
})
export class TaskDetailPageModule {}
