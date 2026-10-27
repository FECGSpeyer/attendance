import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { TeachersPageRoutingModule } from './teachers-routing.module';

import { TeachersPage } from './teachers.page';
import { TeacherPageModule } from '../teacher/teacher.module';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    TeachersPageRoutingModule,
    TeacherPageModule
  ],
  declarations: [TeachersPage]
})
export class TeachersPageModule {}
