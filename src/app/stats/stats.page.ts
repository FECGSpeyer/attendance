import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import dayjs from 'dayjs';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { DbService } from '../services/db.service';
import { Attendance, Group, Person, Player, Tenant } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';
import { AttendanceStatus, DefaultAttendanceType } from '../utilities/constants';

// Register Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-stats',
  templateUrl: './stats.page.html',
  styleUrls: ['./stats.page.scss'],
  standalone: false
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
  public groups: Group[] = [];

  // Chart data
  public attendanceTrendData: ChartData<'line'>;
  public attendanceTrendOptions: ChartConfiguration<'line'>['options'];
  public statusPieData: ChartData<'pie'>;
  public statusPieOptions: ChartConfiguration<'pie'>['options'];
  public registerBarData: ChartData<'bar'>;
  public registerBarOptions: ChartConfiguration<'bar'>['options'];
  public top20Data: ChartData<'bar'>;
  public top20Options: ChartConfiguration<'bar'>['options'];
  public ageDistributionData: ChartData<'bar'>;
  public ageDistributionOptions: ChartConfiguration<'bar'>['options'];
  public avgAgePerRegisterData: ChartData<'bar'>;
  public avgAgePerRegisterOptions: ChartConfiguration<'bar'>['options'];
  public divaIndexData: ChartData<'bar'>;
  public divaIndexOptions: ChartConfiguration<'bar'>['options'];

  public chartsReady = false;

  constructor(
    public db: DbService,
    private modalController: ModalController,
    private alertController: AlertController
  ) { }

  trackByPersonId = (_: number, person: Person): number | string => person.id ?? `${person.firstName}-${person.lastName}`;

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

    // Load groups and initialize charts
    this.groups = this.db.groups();
    await this.initializeCharts();

    await this.getOrganizationStats();
  }

  private async initializeCharts() {
    this.initAttendanceTrendChart();
    this.initStatusPieChart();
    this.initRegisterBarChart();
    this.initTop20Chart();
    this.initAgeDistributionChart();
    this.initAvgAgePerRegisterChart();
    this.initDivaIndexChart();
    this.chartsReady = true;
  }

  private initAttendanceTrendChart() {
    // Sort attendances by date and get last 20
    const sortedAttendances = [...this.attendances]
      .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())
      .slice(-20);

    this.attendanceTrendData = {
      labels: sortedAttendances.map(a => dayjs(a.date).format('DD.MM')),
      datasets: [{
        data: sortedAttendances.map(a => a.percentage),
        label: 'Anwesenheit %',
        fill: true,
        tension: 0.3,
        borderColor: '#3880ff',
        backgroundColor: 'rgba(56, 128, 255, 0.2)',
      }]
    };

    this.attendanceTrendOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Anwesenheitsverlauf (letzte 20 Termine)' }
      },
      scales: {
        y: { min: 0, max: 100, title: { display: true, text: '%' } }
      }
    };
  }

  private initStatusPieChart() {
    // Aggregate all person attendances
    const statusCounts = { present: 0, excused: 0, late: 0, absent: 0 };

    this.attendances.forEach(att => {
      att.persons?.forEach(pa => {
        switch (pa.status) {
          case AttendanceStatus.Present: statusCounts.present++; break;
          case AttendanceStatus.Excused: statusCounts.excused++; break;
          case AttendanceStatus.Late:
          case AttendanceStatus.LateExcused: statusCounts.late++; break;
          case AttendanceStatus.Absent: statusCounts.absent++; break;
        }
      });
    });

    this.statusPieData = {
      labels: ['Anwesend', 'Entschuldigt', 'Verspätet', 'Abwesend'],
      datasets: [{
        data: [statusCounts.present, statusCounts.excused, statusCounts.late, statusCounts.absent],
        backgroundColor: ['#2dd36f', '#3dc2ff', '#ffc409', '#eb445a']
      }]
    };

    this.statusPieOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Statusverteilung aller Termine' }
      }
    };
  }

  private initRegisterBarChart() {
    // Calculate attendance rate per group/register
    const groupStats: { [groupId: number]: { present: number; total: number; name: string } } = {};

    this.groups.forEach(g => {
      groupStats[g.id] = { present: 0, total: 0, name: g.name };
    });

    this.attendances.forEach(att => {
      att.persons?.forEach(pa => {
        const player = this.activePlayers.find(p => p.id === pa.person_id);
        if (player && groupStats[player.instrument]) {
          groupStats[player.instrument].total++;
          if (pa.status === AttendanceStatus.Present || pa.status === AttendanceStatus.Late || pa.status === AttendanceStatus.LateExcused) {
            groupStats[player.instrument].present++;
          }
        }
      });
    });

    const groupData = Object.values(groupStats)
      .filter(g => g.total > 0)
      .map(g => ({ name: g.name, percentage: Math.round((g.present / g.total) * 100) }))
      .sort((a, b) => b.percentage - a.percentage);

    this.registerBarData = {
      labels: groupData.map(g => g.name),
      datasets: [{
        data: groupData.map(g => g.percentage),
        label: 'Anwesenheit %',
        backgroundColor: '#3880ff'
      }]
    };

    this.registerBarOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        title: { display: true, text: 'Anwesenheitsquote nach Register' },
        legend: { display: false }
      },
      scales: {
        x: { min: 0, max: 100, title: { display: true, text: '%' } }
      }
    };
  }

  private initTop20Chart() {
    // Calculate attendance percentage per active player
    const playerStats: { name: string; percentage: number }[] = [];

    this.activePlayers.forEach(player => {
      const playerAttendances = this.attendances.flatMap(att =>
        att.persons?.filter(pa => pa.person_id === player.id) || []
      );

      if (playerAttendances.length > 0) {
        const presentCount = playerAttendances.filter(pa =>
          pa.status === AttendanceStatus.Present ||
          pa.status === AttendanceStatus.Late ||
          pa.status === AttendanceStatus.LateExcused
        ).length;

        playerStats.push({
          name: `${player.firstName} ${player.lastName.charAt(0)}.`,
          percentage: Math.round((presentCount / playerAttendances.length) * 100)
        });
      }
    });

    const top20 = playerStats
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 20);

    this.top20Data = {
      labels: top20.map(p => p.name),
      datasets: [{
        data: top20.map(p => p.percentage),
        label: 'Anwesenheit %',
        backgroundColor: '#2dd36f'
      }]
    };

    this.top20Options = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        title: { display: true, text: 'Top 20 - Anwesenheits-Elite 🏆' },
        legend: { display: false }
      },
      scales: {
        x: { min: 0, max: 100, title: { display: true, text: '%' } }
      }
    };
  }

  private initAgeDistributionChart() {
    // Calculate ages and find min/max
    const ages: number[] = [];
    this.activePlayers.forEach(player => {
      if (player.birthday) {
        const age = dayjs().diff(dayjs(player.birthday), 'year');
        ages.push(age);
      }
    });

    if (ages.length === 0) {
      this.ageDistributionData = { labels: [], datasets: [{ data: [], label: 'Anzahl' }] };
      return;
    }

    const minAge = Math.min(...ages);
    const maxAge = Math.max(...ages);

    // Create 3-year buckets dynamically based on actual age range
    const bucketSize = 3;
    const startBucket = Math.floor(minAge / bucketSize) * bucketSize;
    const endBucket = Math.ceil((maxAge + 1) / bucketSize) * bucketSize;

    const ageBuckets: { label: string; count: number }[] = [];

    for (let i = startBucket; i < endBucket; i += bucketSize) {
      const bucketEnd = i + bucketSize - 1;
      const label = `${i}-${bucketEnd}`;
      const count = ages.filter(age => age >= i && age <= bucketEnd).length;
      ageBuckets.push({ label, count });
    }

    // Filter out empty buckets at the start and end
    let firstNonEmpty = ageBuckets.findIndex(b => b.count > 0);
    let lastNonEmpty = ageBuckets.length - 1 - [...ageBuckets].reverse().findIndex(b => b.count > 0);

    const filteredBuckets = ageBuckets.slice(firstNonEmpty, lastNonEmpty + 1);

    this.ageDistributionData = {
      labels: filteredBuckets.map(b => b.label),
      datasets: [{
        data: filteredBuckets.map(b => b.count),
        label: 'Anzahl Personen',
        backgroundColor: '#5260ff'
      }]
    };

    this.ageDistributionOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Altersverteilung 🎂' },
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      }
    };
  }

  private initAvgAgePerRegisterChart() {
    // Average age per register/group
    const groupAges: { [groupId: number]: { ages: number[]; name: string } } = {};

    this.groups.forEach(g => {
      if (g.id) {
        groupAges[g.id] = { ages: [], name: g.name };
      }
    });

    // Debug: log players without matching groups
    const playersWithoutGroup: string[] = [];

    this.activePlayers.forEach(player => {
      if (player.birthday) {
        const age = dayjs().diff(dayjs(player.birthday), 'year');
        if (player.instrument && groupAges[player.instrument]) {
          groupAges[player.instrument].ages.push(age);
        } else if (player.instrument) {
          // Player has instrument ID but no matching group
          playersWithoutGroup.push(`${player.firstName} ${player.lastName} (instrument: ${player.instrument}, groupName: ${player.groupName})`);
        }
      }
    });

    if (playersWithoutGroup.length > 0) {
      console.warn('Players with instrument ID but no matching group:', playersWithoutGroup);
      console.log('Available groups:', this.groups.map(g => ({ id: g.id, name: g.name })));
    }

    const avgAgeData = Object.values(groupAges)
      .filter(g => g.ages.length > 0)
      .map(g => ({
        name: g.name,
        avgAge: Math.round(g.ages.reduce((a, b) => a + b, 0) / g.ages.length),
        count: g.ages.length
      }))
      .sort((a, b) => b.avgAge - a.avgAge);

    console.log('Average age per register:', avgAgeData);

    this.avgAgePerRegisterData = {
      labels: avgAgeData.map(g => `${g.name} (${g.count})`),
      datasets: [{
        data: avgAgeData.map(g => g.avgAge),
        label: 'Ø Alter',
        backgroundColor: '#ff9f0a'
      }]
    };

    this.avgAgePerRegisterOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        title: { display: true, text: 'Durchschnittsalter pro Register' },
        legend: { display: false }
      },
      scales: {
        x: { title: { display: true, text: 'Jahre' } }
      }
    };
  }

  private initDivaIndexChart() {
    // Diva Index: unexcused absences per player
    const playerAbsences: { name: string; absences: number }[] = [];

    this.activePlayers.forEach(player => {
      const unexcusedAbsences = this.attendances.flatMap(att =>
        att.persons?.filter(pa =>
          pa.person_id === player.id && pa.status === AttendanceStatus.Absent
        ) || []
      ).length;

      if (unexcusedAbsences > 0) {
        playerAbsences.push({
          name: `${player.firstName} ${player.lastName.charAt(0)}.`,
          absences: unexcusedAbsences
        });
      }
    });

    const topDivas = playerAbsences
      .sort((a, b) => b.absences - a.absences)
      .slice(0, 15);

    this.divaIndexData = {
      labels: topDivas.map(p => p.name),
      datasets: [{
        data: topDivas.map(p => p.absences),
        label: 'Unentschuldigte Fehlzeiten',
        backgroundColor: '#eb445a'
      }]
    };

    this.divaIndexOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        title: { display: true, text: 'Diva-Index (Unentschuldigte Abwesenheiten) 💅' },
        legend: { display: false }
      }
    };
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
