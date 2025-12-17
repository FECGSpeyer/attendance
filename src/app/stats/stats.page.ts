import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from '../services/db.service';
import { Attendance, Person, Player, Tenant } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';
import { DefaultAttendanceType } from '../utilities/constants';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.page.html',
  styleUrls: ['./stats.page.scss'],
})
export class StatsPage implements OnInit {
  public attendances: Attendance[] = [];
  public otherAttendances: Attendance[] = [];
  public players: Player[] = [];
  public leftPlayers: Player[] = [];
  public activePlayers: Player[] = [];
  public pausedPlayers: Player[] = [];
  public bestAttendance: Attendance;
  public worstAttendance: Attendance;
  public attPerc: number;
  public isChoir: boolean = false;
  public curAttDate: Date;
  public isGeneral: boolean = false;
  public tenants: Tenant[] = [];
  public allPersonsFromOrganisation: Player[] = [];
  public uniquePersons: Person[] = [];
  public allUniquePersons: Person[] = [];
  public selectedInstances: number[] = [];

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private alertController: AlertController
  ) { }

  async ngOnInit() {
    this.curAttDate = new Date(await this.db.getCurrentAttDate());
    this.isChoir = this.db.tenant().type === DefaultAttendanceType.CHOIR;
    this.isGeneral = this.db.tenant().type === DefaultAttendanceType.GENERAL;
    this.attendances = (await this.db.getAttendance(false, true)).filter((att: Attendance) => dayjs(att.date).isBefore(dayjs().add(1, "day"))).map((att: Attendance) => {
      return {
        ...att,
        percentage: Utils.getPercentage(att.persons),
      };
    });
    this.players = await this.db.getPlayers(true);
    this.leftPlayers = this.players.filter((player: Player) => player.left);
    this.activePlayers = this.players.filter((player: Player) => !player.left && !player.paused);
    this.pausedPlayers = this.players.filter((player: Player) => player.paused && !player.left);

    const sort: Attendance[] = this.attendances.sort((a: Attendance, b: Attendance) => a.percentage - b.percentage);
    this.worstAttendance = sort[0];
    this.bestAttendance = sort[sort.length - 1];

    const attendancesToCalcPerc = this.attendances.filter((att: Attendance) => {
      const type = this.db.attendanceTypes().find((t) => t.id === att.type_id);
      return type.include_in_average;
    });
    this.attPerc = Math.round(((attendancesToCalcPerc.map((att: Attendance) => att.percentage).reduce((a: number, b: number) => a + b, 0)) / (attendancesToCalcPerc.length * 100)) * 100);

    await this.getOrganizationStats();
  }

  async getOrganizationStats() {
    this.tenants = await this.db.getInstancesOfOrganisations(this.db.organisation().id);
    this.allPersonsFromOrganisation = await this.db.getAllPersonsFromOrganisation(this.tenants);
    let uniquePersons = this.allPersonsFromOrganisation.reduce((acc: Player[], person: Player) => {
      if (person.appId && !acc.find(p => p.appId === person.appId)) {
        acc.push(person);
        return acc;
      } else if (
        !person.appId &&
        !acc.find(p => p.firstName === person.firstName && p.lastName === person.lastName && new Date(p.birthday).getTime() === new Date(person.birthday).getTime())
      ) {
        acc.push(person);
      }

      return acc;
    }, []);

    this.allUniquePersons = uniquePersons.map(p => {
      let persons;

      if (p.appId) {
        persons = this.allPersonsFromOrganisation.filter(per => per.appId === p.appId);
      } else {
        persons = this.allPersonsFromOrganisation.filter(per =>
          per.firstName === p.firstName &&
          per.lastName === p.lastName &&
          new Date(per.birthday).getTime() === new Date(p.birthday).getTime()
        );
      }

      return {
        ...p,
        tenants: persons.map(per => per.tenantId).map(tid => {
          const tenant = this.tenants.find(t => t.id === tid);
          return tenant;
        }).filter(t => t !== undefined) as Tenant[]
      }
    }).sort((a, b) => b.tenants.length - a.tenants.length);
    this.uniquePersons = this.allUniquePersons;
  }

  filterInstances() {
    if (this.selectedInstances.length === 0) {
      this.uniquePersons = this.allUniquePersons;
    } else {
      this.uniquePersons = this.allUniquePersons.filter((person: Player) => {
        return (person as any).tenants?.some(t => this.selectedInstances.includes(t.id));
      }).map(p => {
        const filteredTenants = (p as any).tenants.filter((t: Tenant) => this.selectedInstances.includes(t.id));
        return {
          ...p,
          tenants: filteredTenants
        }
      }).sort((a, b) => b.tenants.length - a.tenants.length);
    }
  }

  dismiss() {
    this.modalController.dismiss();
  }

  getAttTypeLength(typeId: string): number {
    return this.attendances.filter((att: Attendance) => att.type_id === typeId).length;
  }

  async openInstancesAlert() {
    const alert = await this.alertController.create({
      header: 'Instanzen der Organisation',
      message: `${this.tenants.map(t => t.longName).join(', ')}`,
      buttons: ['OK']
    });

    await alert.present();
  }

}
