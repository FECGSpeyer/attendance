import { Component, effect, OnInit, ViewChild } from '@angular/core';
import { ActionSheetController, AlertController, IonModal } from '@ionic/angular';
import * as dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { AttendanceStatus } from 'src/app/utilities/constants';
import { CrossTenantPersonAttendance, AttendanceType } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';

type GroupingMode = 'chronological' | 'byTenant';

interface TenantGroup {
  tenantId: number;
  tenantName: string;
  tenantColor: string;
  attendances: CrossTenantPersonAttendance[];
}

@Component({
    selector: 'app-overview',
    templateUrl: './overview.page.html',
    styleUrls: ['./overview.page.scss'],
    standalone: false
})
export class OverviewPage implements OnInit {
  @ViewChild('excuseModal') excuseModal: IonModal;

  public attendances: CrossTenantPersonAttendance[] = [];
  public upcomingAttendances: CrossTenantPersonAttendance[] = [];
  public pastAttendances: CrossTenantPersonAttendance[] = [];
  public tenantGroups: TenantGroup[] = [];
  public tenantGroupValues: string[] = [];
  public currentAttendance: CrossTenantPersonAttendance | null = null;

  public groupingMode: GroupingMode = 'chronological';
  public selAttIds: string[] = [];
  public reason: string = '';
  public reasonSelection: string = 'Krankheitsbedingt';
  public isLateComingEvent: boolean = false;
  public selectedAttendance: CrossTenantPersonAttendance | null = null;

  public perc: number = 0;
  public lateCount: number = 0;

  constructor(
    public db: DbService,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController
  ) {
    effect(async () => {
      if (this.db.tenants() && this.db.tenantUsers()) {
        await this.loadAttendances();
      }
    });
  }

  async ngOnInit() {
    await this.loadAttendances();
  }

  async loadAttendances(forceRefresh: boolean = false) {
    const allAttendances = await this.db.loadAllPersonAttendancesAcrossTenants(forceRefresh);
    this.attendances = allAttendances;
    this.processAttendances();
  }

  processAttendances() {
    const now = dayjs().startOf('day');

    // Split into upcoming and past
    this.upcomingAttendances = this.attendances
      .filter(att => !dayjs(att.date).isBefore(now))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    this.pastAttendances = this.attendances
      .filter(att => dayjs(att.date).isBefore(now))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Set current attendance (next upcoming)
    this.currentAttendance = this.upcomingAttendances.length > 0 ? this.upcomingAttendances[0] : null;
    if (this.currentAttendance) {
      this.upcomingAttendances = this.upcomingAttendances.slice(1);
    }

    // Calculate statistics
    this.calculateStats();

    // Group by tenant
    this.groupByTenant();
  }

  calculateStats() {
    const pastToCalc = this.pastAttendances.filter(att => {
      return att.attendanceType?.include_in_average ?? true;
    });

    if (pastToCalc.length > 0) {
      const attended = pastToCalc.filter(att => att.attended);
      this.perc = Math.round((attended.length / pastToCalc.length) * 100);
      this.lateCount = this.pastAttendances.filter(att => att.status === AttendanceStatus.Late).length;
    } else {
      this.perc = 0;
      this.lateCount = 0;
    }
  }

  groupByTenant() {
    const groupMap = new Map<number, TenantGroup>();

    for (const att of this.attendances) {
      if (!groupMap.has(att.tenantId)) {
        groupMap.set(att.tenantId, {
          tenantId: att.tenantId,
          tenantName: att.tenantName,
          tenantColor: att.tenantColor,
          attendances: [],
        });
      }
      groupMap.get(att.tenantId)!.attendances.push(att);
    }

    // Sort attendances within each group: upcoming first (ascending), then past (descending)
    const now = new Date();
    groupMap.forEach(group => {
      const upcoming = group.attendances
        .filter(a => new Date(a.date) >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const past = group.attendances
        .filter(a => new Date(a.date) < now)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      group.attendances = [...upcoming, ...past];
    });

    this.tenantGroups = Array.from(groupMap.values());
    // Generate accordion values for all tenant groups
    this.tenantGroupValues = this.tenantGroups.map((_, i) => 'tenant-' + i);
  }

  async handleRefresh(event: any) {
    await this.loadAttendances(true);
    event.target.complete();
  }

  onGroupingChange(event: any) {
    this.groupingMode = event.detail.value;
  }

  async presentActionSheetForChoice(attendance: CrossTenantPersonAttendance) {
    this.selectedAttendance = attendance;
    this.reasonSelection = 'Krankheitsbedingt';

    let buttons = [
      {
        text: 'Anmelden',
        handler: () => this.signin(attendance),
      },
      {
        text: 'Anmelden mit Notiz',
        handler: () => this.showNoteAlertForSignin(attendance),
      },
      {
        text: 'Abmelden',
        handler: () => {
          if (this.isAttToday(attendance)) {
            this.reasonSelection = 'Sonstiger Grund';
            this.reason = '';
          } else {
            this.reason = 'Krankheitsbedingt';
          }
          this.excuseModal.present();
          this.isLateComingEvent = false;
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Verspätung eintragen',
        handler: () => {
          if (this.isAttToday(attendance)) {
            this.reasonSelection = 'Sonstiger Grund';
            this.reason = '';
          } else {
            this.reason = 'Krankheitsbedingt';
          }
          this.excuseModal.present();
          this.isLateComingEvent = true;
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Notiz anpassen',
        handler: async () => {
          await this.showNoteAlert(attendance);
          this.actionSheetController.dismiss();
        },
      },
      {
        text: 'Abbrechen',
        handler: () => { },
        role: 'destructive',
        data: { action: 'cancel' },
      },
    ];

    const attType = attendance.attendanceType;

    let canSignin = true;
    if (attendance.attendance?.deadline) {
      const deadline = dayjs(attendance.attendance.deadline);
      const localDeadline = deadline.subtract(dayjs().utcOffset(), 'minute');
      const now = dayjs();
      if (now.isAfter(localDeadline)) {
        canSignin = false;
      }
    }

    if (attendance.text === 'X' || !canSignin) {
      buttons = buttons.filter(btn => btn.text !== 'Anmelden' && btn.text !== 'Anmelden mit Notiz');
    } else if (attType && !attType.available_statuses.includes(AttendanceStatus.Excused)) {
      buttons = buttons.filter(btn => btn.text !== 'Abmelden');
    } else if (attType && !attType.available_statuses.includes(AttendanceStatus.Late)) {
      buttons = buttons.filter(btn => btn.text !== 'Verspätung eintragen');
    }

    if (attendance.text !== 'X') {
      buttons = buttons.filter(btn => btn.text !== 'Notiz anpassen');
    }

    if (attendance.text === 'E' || attendance.text === 'A') {
      buttons = buttons.filter(btn => btn.text !== 'Abmelden' && btn.text !== 'Verspätung eintragen');
    }

    if (buttons.length <= 1) {
      Utils.showToast('Für diesen Termin sind keine Aktionen verfügbar.', 'warning', 4000);
      return;
    }

    this.selAttIds = [attendance.id!];
    const actionSheet = await this.actionSheetController.create({
      buttons,
    });

    await actionSheet.present();
  }

  async showNoteAlertForSignin(attendance: CrossTenantPersonAttendance) {
    const alert = await this.alertController.create({
      header: 'Notiz für Anmeldung',
      inputs: [
        {
          name: 'note',
          type: 'textarea',
          placeholder: 'Gib hier deine Notiz ein',
          value: '',
        },
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Anmelden',
          handler: (data) => {
            this.signin(attendance, data.note);
          },
        },
      ],
    });

    await alert.present();
  }

  async signin(attendance: CrossTenantPersonAttendance, notes: string = '') {
    await this.db.signin(
      attendance.id!,
      attendance.status === AttendanceStatus.LateExcused ? 'lateSignIn' :
        attendance.status === AttendanceStatus.Neutral ? 'neutralSignin' : 'signin',
      notes
    );

    Utils.showToast('Schön, dass du dabei bist 🙂', 'success', 4000);
    await this.loadAttendances(true);
  }

  async signout() {
    await this.db.signout(this.selAttIds, this.reason, this.isLateComingEvent);

    this.excuseModal.dismiss();
    this.reason = '';

    Utils.showToast(
      this.isLateComingEvent
        ? 'Vielen Dank für die Info und Gottes Segen dir!'
        : 'Vielen Dank für deine rechtzeitige Abmeldung und Gottes Segen dir.',
      'success',
      4000
    );

    this.reasonSelection = '';
    await this.loadAttendances(true);
  }

  async showNoteAlert(attendance: CrossTenantPersonAttendance) {
    const note = attendance.notes || '';
    const alert = await this.alertController.create({
      header: 'Notiz anpassen',
      inputs: [
        {
          name: 'note',
          type: 'textarea',
          placeholder: 'Gib hier deine Notiz ein',
          value: note,
        },
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Speichern',
          handler: async (data) => {
            await this.db.updateAttendanceNote(attendance.id!, data.note);
            Utils.showToast('Notiz erfolgreich aktualisiert.', 'success', 4000);
            await this.loadAttendances(true);
          },
        },
      ],
    });

    await alert.present();
  }

  onReasonSelect(event: any) {
    const currentReasonSelection = event.detail.value;
    if (!currentReasonSelection) return;

    if (currentReasonSelection !== 'Sonstiger Grund') {
      this.excuseModal.setCurrentBreakpoint(0.3);
      this.reason = currentReasonSelection;
    } else {
      this.excuseModal.setCurrentBreakpoint(0.4);
      this.reason = '';
    }
  }

  dismissExcuseModal() {
    this.excuseModal.dismiss();
  }

  increaseModalBreakpoint() {
    this.excuseModal.setCurrentBreakpoint(0.8);
  }

  decreaseModalBreakpoint() {
    this.excuseModal.setCurrentBreakpoint(0.4);
  }

  attHasPassed(att: CrossTenantPersonAttendance): boolean {
    return dayjs(att.date).isBefore(dayjs(), 'day');
  }

  attIsInFuture(att: CrossTenantPersonAttendance): boolean {
    return dayjs(att.date).isAfter(dayjs(), 'day');
  }

  isAttToday(att: CrossTenantPersonAttendance): boolean {
    return dayjs(att.date).isSame(dayjs(), 'day');
  }

  getReadableDate(date: string, attType?: AttendanceType): string {
    return Utils.getReadableDate(date, attType);
  }

  isReasonSelectionInvalid(reason: string): boolean {
    if (!(reason && reason.length > 4) || /\S/.test(reason) === false) {
      return true;
    }
    return false;
  }

  showDeadlineInfo(att: CrossTenantPersonAttendance): boolean {
    if (!att.attendance?.deadline) return false;
    const deadline = dayjs(att.attendance.deadline);
    const now = dayjs();
    return now.isBefore(deadline) && deadline.diff(now, 'day') <= 3;
  }

  getDeadlineText(att: CrossTenantPersonAttendance): string {
    if (!att.attendance?.deadline) return '';
    const deadline = dayjs(att.attendance.deadline);
    return `Anmeldefrist: ${deadline.format('DD.MM.YYYY HH:mm')}`;
  }

  getBadgeColor(att: CrossTenantPersonAttendance): string {
    switch (att.text) {
      case 'X': return 'success';
      case 'A': return 'danger';
      case 'L': return att.status === AttendanceStatus.Late ? 'tertiary' : 'rosa';
      case 'N': return 'medium';
      case 'E': return 'warning';
      default: return 'warning';
    }
  }

  getBadgeText(att: CrossTenantPersonAttendance): string {
    return att.text === 'X' ? '✓' : att.text || '';
  }
}
