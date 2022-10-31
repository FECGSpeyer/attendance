import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, IonContent, IonSelect, ModalController, Platform } from '@ionic/angular';
import { format, parseISO } from 'date-fns';
import { DbService } from 'src/app/services/db.service';
import { Instrument, PersonAttendance, Player, Teacher } from 'src/app/utilities/interfaces';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

@Component({
  selector: 'app-person',
  templateUrl: './person.page.html',
  styleUrls: ['./person.page.scss'],
})
export class PersonPage implements OnInit {
  @Input() existingPlayer: Player;
  @Input() instruments: Instrument[];
  @ViewChild('select') select: IonSelect;
  @ViewChild('content') content: IonContent;

  public newPlayer: Player = {
    firstName: "",
    lastName: "",
    instrument: 1,
    playsSince: new Date().toISOString(),
    joined: new Date().toISOString(),
    birthday: new Date().toISOString(),
    hasTeacher: false,
    isLeader: false,
    notes: "",
    teacher: null,
  };
  public player: Player;
  public birthdayString: string = format(new Date(), 'dd.MM.yyyy');
  public playsSinceString: string = format(new Date(), 'dd.MM.yyyy');
  public joinedString: string = format(new Date(), 'dd.MM.yyyy');
  public max: string = new Date().toISOString();
  public attendance: PersonAttendance[] = [];
  public teachers: Teacher[] = [];
  public perc: number = 0;

  constructor(
    private db: DbService,
    private modalController: ModalController,
    private actionSheetController: ActionSheetController,
  ) { }

  async ngOnInit() {
    this.teachers = await this.db.getTeachers();
    if (this.existingPlayer) {
      this.player = { ...this.existingPlayer };
      this.birthdayString = this.formatDate(this.existingPlayer.birthday);
      this.playsSinceString = this.formatDate(this.existingPlayer.playsSince);
      this.joinedString = this.formatDate(this.existingPlayer.joined);
      this.attendance = await this.db.getPlayerAttendance(this.player.id);
      this.player.teacherName = this.player.teacher ? this.teachers.find((teacher: Teacher) => teacher).name : "";
      this.perc = Math.round(this.attendance.filter((att: PersonAttendance) => att.attended).length / this.attendance.length * 100);
    } else {
      this.player = { ...this.newPlayer };
      this.player.instrument = this.instruments[0].id;
    }
  }


  formatDate(value: string) {
    return format(parseISO(value), 'dd.MM.yyyy');
  }

  dismiss(): void {
    this.modalController.dismiss();
  }

  async addPlayer(): Promise<void> {
    await this.db.addPlayer(this.player);
    this.modalController.dismiss({
      added: true
    });
  }

  async updatePlayer(): Promise<void> {
    await this.db.updatePlayer(this.player);
    this.modalController.dismiss({
      added: true
    });
  }

  async removePlayer(): Promise<void> {
    const sheet: HTMLIonActionSheetElement = await this.actionSheetController.create({
      buttons: [{
        text: "Archivieren",
        handler: (): void => {
          this.archivePlayer();
        },
      }, {
        text: "Entfernen",
        handler: (): void => {
          this.remove();
        },
      }, {
        role: 'cancel',
        text: "Abbrechen"
      }],
    });

    await sheet.present();
  }

  async archivePlayer(): Promise<void> {
    await this.db.archivePlayer(this.player.id);
    this.modalController.dismiss({
      added: true
    });
  }

  async remove(): Promise<void> {
    await this.db.removePlayer(this.player.id);
    this.modalController.dismiss({
      added: true
    });
  }

  scrollDown(): void {
    //this.content.scrollToBottom(); // funktioniert nicht, weil das scrollable item mit der tastatur NICHT das content-component ist,
    // sondern iwas anderes
  }

}
