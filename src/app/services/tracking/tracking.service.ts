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
  // Diagnostics for the cold-start push → attendance modal flow. Each fetch
  // attempt of a person_attendances join writes one of these so we can spot
  // races / read-replica lag in production by querying usage_events.
  AttendanceFetchAttempt: 'attendance_fetch_attempt',
  AttendanceFetchStageB: 'attendance_fetch_stage_b',
  AttendanceFetchResolved: 'attendance_fetch_resolved',
  AttendanceFetchModifyThrow: 'attendance_fetch_modify_throw',
  // Fetch returned 44 persons in 72ms but the modal still rendered 0/0 on iOS
  // push-open. Root cause: ngOnInit threw on `this.type.manage_songs` because
  // attendance.type_id wasn't in the type catalog, aborting before
  // initializeAttObjects() could populate `this.players`. These two events
  // make the failure modes that bypass the persons render observable.
  AttendanceTypeUnresolved: 'attendance_type_unresolved',
  AttendanceSecondaryInitFailed: 'attendance_secondary_init_failed',
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

