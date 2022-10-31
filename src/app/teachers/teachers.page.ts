import { Component, OnInit } from '@angular/core';
import { IonModal, IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from '../services/db.service';
import { TeacherPage } from '../teacher/teacher.page';
import { Instrument, Teacher } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

@Component({
  selector: 'app-teachers',
  templateUrl: './teachers.page.html',
  styleUrls: ['./teachers.page.scss'],
})
export class TeachersPage implements OnInit {
  instruments: Instrument[] = [];
  teachers: Teacher[] = [];

  constructor(
    private db: DbService,
    private routerOutlet: IonRouterOutlet,
    private modalController: ModalController,
  ) { }

  async ngOnInit() {
    this.instruments = await this.db.getInstruments(true);
    await this.getTeachers();
  }

  async getTeachers() {
    this.teachers = (await this.db.getTeachers()).map((t: Teacher) => {
      return {
        ...t,
        insNames: t.instruments.map((i: number) => this.instruments.find((ins: Instrument) => ins.id === i).name).join(", "),
      };
    });
  }

  async addTeacher(name: string, instruments: number[], notes: string, number: string, isPrivate: boolean, modal: IonModal) {
    if (name.length < 3 || instruments.length === 0) {
      Utils.showToast("Bitte fülle alle Felder aus...", "danger");

      return;
    }

    this.db.addTeacher({
      name, instruments, notes, number, private: isPrivate,
    });

    modal.dismiss();

    await this.getTeachers();
  }

  async openModal(teacher: Teacher): Promise<void> {
    const modal: HTMLIonModalElement = await this.modalController.create({
      component: TeacherPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        teacher,
        instruments: this.instruments,
      }
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data) {
      await this.getTeachers();
    }
  }

}
