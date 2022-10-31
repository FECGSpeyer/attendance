import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Instrument, Teacher } from '../utilities/interfaces';

@Component({
  selector: 'app-teacher',
  templateUrl: './teacher.page.html',
  styleUrls: ['./teacher.page.scss'],
})
export class TeacherPage implements OnInit {
  @Input() teacher: Teacher;
  @Input() instruments: Instrument[];

  editedTeacher: Teacher;

  constructor(
    private modalController: ModalController
  ) { }

  ngOnInit() {
    this.editedTeacher = { ...this.teacher };
  }

  dismiss() {
    this.modalController.dismiss();
  }

}
