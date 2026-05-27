import { Injectable } from '@angular/core';
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
} as const;
export type TrackingEvent = typeof TrackingEvent[keyof typeof TrackingEvent];

export type DeviceType = 'ios' | 'android' | 'web';

@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly deviceType: DeviceType = this.detectDeviceType();

  constructor(private db: DbService) {}

  track(eventName: TrackingEvent, properties: Record<string, any> = {}): void {
    void this.fire(eventName, properties);
  }

  private async fire(eventName: string, properties: Record<string, any>): Promise<void> {
    try {
      await supabase.from('usage_events').insert({
        event_name: eventName,
        tenant_id: this.db.tenant()?.id ?? null,
        device_type: this.deviceType,
        properties,
      });
    } catch {
      // swallow — tracking must never disrupt UX
    }
  }

  private detectDeviceType(): DeviceType {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') return 'ios';
    if (platform === 'android') return 'android';
    return 'web';
  }
}

