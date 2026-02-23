import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TeachersPageRoutingModule } from './teachers-routing.module';

import { TeachersPage } from './teachers.page';
import { TeacherPageModule } from '../teacher/teacher.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TeachersPageRoutingModule,
    TeacherPageModule
  ],
  declarations: [TeachersPage]
})
export class TeachersPageModule {}
