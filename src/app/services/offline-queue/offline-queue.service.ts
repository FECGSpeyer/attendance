import { Injectable, Signal, inject, signal } from '@angular/core';
import { ConnectionStatus, Network } from '@capacitor/network';
import { Storage } from '@ionic/storage-angular';
import { PersonAttendance } from '../../utilities/interfaces';
import { Utils } from '../../utilities/Utils';

interface QueuedWrite {
  id: string;
  personAttendanceId: string;
  payload: Partial<PersonAttendance>;
  userId?: string;
  createdAt: string;
}

const QUEUE_KEY = 'offline_writes_v1';

@Injectable({
  providedIn: 'root'
})
export class OfflineQueueService {
  private storage = inject(Storage);
  private _pendingCount = signal(0);

  // Exposed to templates via db or direct injection
  readonly pendingCount: Signal<number> = this._pendingCount.asReadonly();

  // Injected lazily to avoid circular dep (AttendanceService → OfflineQueueService → AttendanceService)
  private flushFn: ((id: string, payload: Partial<PersonAttendance>, userId?: string) => Promise<void>) | null = null;

  registerFlushFn(fn: (id: string, payload: Partial<PersonAttendance>, userId?: string) => Promise<void>): void {
    this.flushFn = fn;
  }

  async init(): Promise<void> {
    const queue = await this.loadQueue();
    this._pendingCount.set(queue.length);

    const status: ConnectionStatus = await Network.getStatus();
    if (status.connected && queue.length > 0) {
      void this.flush();
    }

    Network.addListener('networkStatusChange', (s: ConnectionStatus) => {
      if (s.connected) {
        void this.flush();
      }
    });
  }

  async enqueue(personAttendanceId: string, payload: Partial<PersonAttendance>, userId?: string): Promise<void> {
    const queue = await this.loadQueue();

    // Last-write-wins: merge into existing entry for same personAttendanceId
    const existing = queue.findIndex(e => e.personAttendanceId === personAttendanceId);
    const entry: QueuedWrite = {
      id: existing >= 0 ? queue[existing].id : crypto.randomUUID(),
      personAttendanceId,
      payload: existing >= 0 ? { ...queue[existing].payload, ...payload } : payload,
      userId,
      createdAt: existing >= 0 ? queue[existing].createdAt : new Date().toISOString(),
    };

    if (existing >= 0) {
      queue[existing] = entry;
    } else {
      queue.push(entry);
    }

    await this.saveQueue(queue);
    this._pendingCount.set(queue.length);
  }

  async flush(): Promise<void> {
    if (!this.flushFn) { return; }

    const queue = await this.loadQueue();
    if (queue.length === 0) { return; }

    const failed: QueuedWrite[] = [];

    for (const entry of queue) {
      try {
        await this.flushFn(entry.personAttendanceId, entry.payload, entry.userId);
      } catch {
        failed.push(entry);
      }
    }

    await this.saveQueue(failed);
    this._pendingCount.set(failed.length);

    if (failed.length === 0 && queue.length > 0) {
      Utils.showToast('Offline-Änderungen gespeichert', 'success');
    }
  }

  private async loadQueue(): Promise<QueuedWrite[]> {
    const raw = await this.storage.get(QUEUE_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  private async saveQueue(queue: QueuedWrite[]): Promise<void> {
    await this.storage.set(QUEUE_KEY, queue);
  }
}
