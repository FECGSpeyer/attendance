import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DbService } from '../services/db.service';
import { Instrument, Teacher } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

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
    private modalController: ModalController,
    private db: DbService,
  ) { }

  ngOnInit() {
    this.editedTeacher = { ...this.teacher };
  }

  dismiss() {
    this.modalController.dismiss();
  }

  async editTeacher() {
    await this.db.updateTeacher(this.editedTeacher, this.editedTeacher.id);

    Utils.showToast("Lehrer erfolgreich geupdated!", "success");

    this.modalController.dismiss(true);
  }

}
