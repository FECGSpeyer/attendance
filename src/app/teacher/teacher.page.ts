import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DbService } from '../services/db.service';
import { Player, Teacher } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

@Component({
    selector: 'app-teacher',
    templateUrl: './teacher.page.html',
    styleUrls: ['./teacher.page.scss'],
    standalone: false
})
export class TeacherPage implements OnInit {
  @Input() teacher: Teacher;
  @Input() players: Player[];

  editedTeacher: Teacher;
  playersFromTeacher: Player[] = [];

  constructor(
    private modalController: ModalController,
    public db: DbService,
  ) { }

  ngOnInit() {
    this.editedTeacher = { ...this.teacher };
    this.playersFromTeacher = this.players.filter(p => p.teacher === this.teacher.id);
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
