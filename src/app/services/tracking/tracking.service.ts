import { Injectable, Injector } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../base/supabase';
import { DbService } from '../db.service';

export const TrackingEvent = {
  PageView: 'page_view',
  Login: 'login',
  AttendanceCheckIn: 'attendance_check_in',
  AttendanceCheckOut: 'attendance_check_out',
  ParentSignIn: 'parent_signin',
  ParentSignOut: 'parent_signout',
  PushReceived: 'push_received',
  PushOpened: 'push_opened',
  MeetingCreated: 'meeting_created',
  SongShared: 'song_shared',
  ReportExported: 'report_exported',
  HandoverCreated: 'handover_created',
  PlayerAdded: 'player_added',
  PlayerUpdated: 'player_updated',
  PlayerRemoved: 'player_removed',
  TeacherAdded: 'teacher_added',
  TeacherUpdated: 'teacher_updated',
  InstrumentAdded: 'instrument_added',
  InstrumentUpdated: 'instrument_updated',
  InstrumentRemoved: 'instrument_removed',
  NotificationSettingsChanged: 'notification_settings_changed',
  FileUploaded: 'file_uploaded',
  AccountDeleted: 'account_deleted',
} as const;
export type TrackingEvent = typeof TrackingEvent[keyof typeof TrackingEvent];

export type DeviceType = 'ios' | 'android' | 'web';

@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly deviceType: DeviceType = this.detectDeviceType();
  private dbRef: DbService | null = null;

  constructor(private injector: Injector) {}

  track(eventName: TrackingEvent, properties: Record<string, any> = {}): void {
    void this.fire(eventName, properties);
  }

  private async fire(eventName: string, properties: Record<string, any>): Promise<void> {
    try {
      await supabase.from('usage_events').insert({
        event_name: eventName,
        tenant_id: this.getDb()?.tenant()?.id ?? null,
        device_type: this.deviceType,
        properties,
      });
    } catch {
      // swallow — tracking must never disrupt UX
    }
  }

  private getDb(): DbService | null {
    if (!this.dbRef) {
      try {
        this.dbRef = this.injector.get(DbService);
      } catch {
        return null;
      }
    }
    return this.dbRef;
  }

  private detectDeviceType(): DeviceType {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') return 'ios';
    if (platform === 'android') return 'android';
    return 'web';
  }
}

