import { Component, OnInit } from '@angular/core';
import { IonModal, IonRouterOutlet, ModalController } from '@ionic/angular';
import { DbService } from '../services/db.service';
import { TeacherPage } from '../teacher/teacher.page';
import { Role } from '../utilities/constants';
import { Group, Player, Teacher } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

@Component({
  selector: 'app-teachers',
  templateUrl: './teachers.page.html',
  styleUrls: ['./teachers.page.scss'],
})
export class TeachersPage implements OnInit {
  teachers: Teacher[] = [];
  players: Player[] = [];
  isAdmin: boolean = false;
  selInstruments: number[] = [];
  instruments: Group[] = [];

  constructor(
    private db: DbService,
    private routerOutlet: IonRouterOutlet,
    private modalController: ModalController,
  ) { }

  trackByTeacherId = (_: number, teacher: Teacher): number => teacher.id;
  trackByGroupId = (_: number, group: Group): number => group.id;

  async ngOnInit() {
    this.isAdmin = this.db.tenantUser().role === Role.ADMIN || this.db.tenantUser().role === Role.RESPONSIBLE;
    this.players = await this.db.getPlayers();
    this.instruments = this.db.groups().filter((ins: Group) => !ins.maingroup);
    await this.getTeachers();
  }

  async getTeachers() {
    this.teachers = (await this.db.getTeachers()).map((t: Teacher) => {
      return {
        ...t,
        insNames: t.instruments.map((i: number) => this.db.groups().find((ins: Group) => ins.id === i).name).join(", "),
        playerCount: this.players.filter((p: Player) => p.teacher === t.id).length
      };
    });
  }

  async addTeacher(name: string | number, instruments: number[], notes: string, number: string | number, pri: string, modal: IonModal) {
    if (String(name).length < 3 || instruments.length === 0) {
      Utils.showToast("Bitte fülle alle Felder aus...", "danger");

      return;
    }

    await this.db.addTeacher({
      name: String(name), instruments, notes, number: String(number), private: pri === "true",
    });

    await modal.dismiss();

    await this.getTeachers();
  }

  async openModal(teacher: Teacher): Promise<void> {
    if (!this.isAdmin) {
      return;
    }

    const modal: HTMLIonModalElement = await this.modalController.create({
      component: TeacherPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: {
        teacher,
        players: this.players,
      }
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();

    if (data) {
      await this.getTeachers();
    }
  }

}
