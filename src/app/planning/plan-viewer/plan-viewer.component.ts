import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ActionSheetController } from '@ionic/angular';
import dayjs from 'dayjs';
import { Attendance, FieldSelection, Plan, Song } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';
import { DbService } from '../../services/db.service';

@Component({
  selector: 'app-plan-viewer',
  templateUrl: './plan-viewer.component.html',
  styleUrls: ['./plan-viewer.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class PlanViewerComponent implements OnInit, OnDestroy {
  @Input() attendance: Partial<Attendance>;
  @Input() plan: Plan;
  @Input() isPractice = true;
  @Input() playerInstrument: number;
  @Input() songs: Song[] = [];

  public hasChatId = false;
  public liveMode = false;
  public activeFieldIndex = -1;
  private liveInterval: any;

  constructor(
    private modalController: ModalController,
    private actionSheetController: ActionSheetController,
    public db: DbService
  ) {}

  ngOnInit() {
    this.hasChatId = Boolean(this.db.tenantUser()?.telegram_chat_id);
  }

  ngOnDestroy() {
    this.stopLive();
  }

  dismiss() {
    this.modalController.dismiss();
  }

  isLiveNow(): boolean {
    if (!this.attendance?.date || !this.plan?.time || !this.plan?.fields?.length) { return false; }
    const now = dayjs();
    const timeBase = dayjs(this.plan.time).isValid()
      ? dayjs(this.plan.time)
      : dayjs().hour(Number(this.plan.time.substring(0, 2))).minute(Number(this.plan.time.substring(3, 5)));
    const start = dayjs(this.attendance.date).hour(timeBase.hour()).minute(timeBase.minute()).second(0);
    const totalMinutes = this.plan.fields.reduce((s, f) => s + (Number(f.time) || 0), 0);
    const end = start.add(totalMinutes, 'minute');
    return now.isAfter(start.subtract(5, 'minute')) && now.isBefore(end.add(15, 'minute'));
  }

  toggleLive() {
    this.liveMode = !this.liveMode;
    if (this.liveMode) {
      this.updateActiveIndex();
      this.liveInterval = setInterval(() => this.updateActiveIndex(), 30000);
    } else {
      this.stopLive();
    }
  }

  private stopLive() {
    if (this.liveInterval) { clearInterval(this.liveInterval); this.liveInterval = null; }
    this.activeFieldIndex = -1;
    this.liveMode = false;
  }

  updateActiveIndex() {
    if (!this.plan?.fields?.length || !this.plan.time || !this.attendance?.date) {
      this.activeFieldIndex = -1;
      return;
    }
    const now = dayjs();
    const timeBase = dayjs(this.plan.time).isValid()
      ? dayjs(this.plan.time)
      : dayjs().hour(Number(this.plan.time.substring(0, 2))).minute(Number(this.plan.time.substring(3, 5)));
    let t = dayjs(this.attendance.date).hour(timeBase.hour()).minute(timeBase.minute()).second(0);
    for (let i = 0; i < this.plan.fields.length; i++) {
      t = t.add(Number(this.plan.fields[i].time) || 0, 'minute');
      if (now.isBefore(t)) { this.activeFieldIndex = i; return; }
    }
    this.activeFieldIndex = this.plan.fields.length - 1;
  }

  calculateTime(field: FieldSelection, index: number): string {
    if (!this.plan?.time) {return '';}

    let minutesToAdd = 0;
    let currentIndex = 0;

    while (currentIndex !== index) {
      minutesToAdd += Number(this.plan.fields[currentIndex].time);
      currentIndex++;
    }

    const time = dayjs(this.plan.time).isValid()
      ? dayjs(this.plan.time)
      : dayjs().hour(Number(this.plan.time.substring(0, 2))).minute(Number(this.plan.time.substring(3, 5)));

    return `${time.add(minutesToAdd, 'minute').format('HH:mm')} ${field.conductor ? `| ${field.conductor}` : ''}`;
  }

  getEndTime(): string {
    if (!this.plan?.end) {return '';}

    const end = dayjs(this.plan.end).isValid()
      ? dayjs(this.plan.end)
      : dayjs().hour(Number(this.plan.end.substring(0, 2))).minute(Number(this.plan.end.substring(3, 5)));

    return end.format('HH:mm');
  }

  getStartTime(): string {
    if (!this.plan?.time) {return '';}

    const time = dayjs(this.plan.time).isValid()
      ? dayjs(this.plan.time)
      : dayjs().hour(Number(this.plan.time.substring(0, 2))).minute(Number(this.plan.time.substring(3, 5)));

    return time.format('HH:mm');
  }

  getDateFormatted(): string {
    if (!this.attendance?.date) {return '';}
    return dayjs(this.attendance.date).format('DD.MM.YYYY');
  }

  isInstrumentMissing(field: FieldSelection): boolean {
    if (!field.songId || !this.playerInstrument || !this.songs?.length) {
      return false;
    }

    const song = this.songs.find((s: Song) => s.id === field.songId);
    if (!song || !song.instrument_ids || !song.instrument_ids.length) {
      return false;
    }

    return !song.instrument_ids.includes(this.playerInstrument);
  }

  async showExportOptions() {
    const buttons: any[] = [
      {
        text: 'PDF exportieren',
        handler: () => this.exportPdf()
      },
      {
        text: 'PDF exportieren (2x A5)',
        handler: () => this.exportPdf(true)
      }
    ];

    if (this.hasChatId) {
      buttons.push({
        text: 'Per Telegram senden (PDF)',
        handler: () => this.sendTelegram(false)
      });
      buttons.push({
        text: 'Per Telegram senden (PDF 2x A5)',
        handler: () => this.sendTelegram(false, true)
      });
      buttons.push({
        text: 'Per Telegram senden (Bild)',
        handler: () => this.sendTelegram(true)
      });
    }

    buttons.push({
      text: 'Abbrechen',
      role: 'destructive'
    });

    const actionSheet = await this.actionSheetController.create({
      header: 'Exportieren',
      buttons
    });

    await actionSheet.present();
  }

  async exportPdf(sideBySide: boolean = false) {
    if (!this.plan?.fields?.length) {
      Utils.showToast('Kein Plan verfügbar', 'warning');
      return;
    }

    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    const planningTitle = this.plan?.title?.trim() || Utils.getPlanningTitle(type, this.attendance.typeInfo);

    await Utils.createPlanExport({
      time: this.plan.time,
      end: this.plan.end,
      fields: this.plan.fields,
      attendance: this.attendance?.id,
      attendances: this.attendance ? [this.attendance] : [],
      sideBySide,
      branding: await Utils.buildTenantBranding(this.db.tenant()),
    }, planningTitle);
  }

  async sendTelegram(asImage: boolean, sideBySide: boolean = false) {
    if (!this.plan?.fields?.length) {
      Utils.showToast('Kein Plan verfügbar', 'warning');
      return;
    }

    const type = this.db.attendanceTypes().find(type => type.id === this.attendance.type_id);
    const planningTitle = this.plan?.title?.trim() || Utils.getPlanningTitle(type, this.attendance.typeInfo);
    const name = this.attendance?.date
      ? dayjs(this.attendance.date).format('DD_MM_YYYY')
      : dayjs().format('DD_MM_YYYY');

    const blob = await Utils.createPlanExport({
      time: this.plan.time,
      end: this.plan.end,
      fields: this.plan.fields,
      asBlob: true,
      asImage,
      sideBySide,
      attendance: this.attendance?.id,
      attendances: this.attendance ? [this.attendance] : [],
      branding: await Utils.buildTenantBranding(this.db.tenant()),
    }, planningTitle);

    this.db.sendPlanPerTelegram(
      blob,
      `${planningTitle.replace('(', '').replace(')', '')}_${name}${sideBySide ? '_2x' : ''}`,
      asImage
    );

    Utils.showToast('Plan wird per Telegram gesendet...', 'success');
  }
}
