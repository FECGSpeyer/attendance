import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { AlertController, ModalController, Platform } from '@ionic/angular/lazy';
import { Storage } from '@ionic/storage-angular';
import { AttendancePage } from './attendance.page';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import {
  createAlertControllerMock,
  createModalControllerMock,
  createPlatformMock,
} from '../../../testing/mocks/ionic.mock';
import { DbService } from '../../services/db.service';
import { ActivatedRoute } from '@angular/router';

describe('AttendancePage', () => {
  let component: AttendancePage;
  let fixture: ComponentFixture<AttendancePage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockStorage = {
    create: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [AttendancePage],
      imports: [RouterTestingModule],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: Platform, useValue: createPlatformMock() },
        { provide: Storage, useValue: mockStorage },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: vi.fn().mockReturnValue(null) } },
          },
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AttendancePage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have access to tenant signal', () => {
    expect(dbServiceMock.tenant()).toBeDefined();
  });

  it('should initialize with empty players array', () => {
    expect(component.players).toEqual([]);
  });

  it('should initialize with online status true', () => {
    expect(component.isOnline).toBe(true);
  });

  it('renders the persons list without waiting for Werke, Kategorien and Dirigenten', async () => {
    const never = new Promise<never>(() => undefined);
    const db: any = dbServiceMock;
    db.checkToken = vi.fn().mockResolvedValue(undefined);
    db.canAccessFiles = vi.fn().mockReturnValue(false);
    db.getPersonIdForTenant = vi.fn().mockResolvedValue(null);
    db.getSongs = vi.fn().mockReturnValue(never);
    db.getGroupCategories = vi.fn().mockReturnValue(never);
    db.getConductors = vi.fn().mockReturnValue(never);
    db.getHistoryByAttendanceId = vi.fn().mockReturnValue(never);
    db.getAttendanceByIdRobust = vi.fn().mockResolvedValue({
      id: 7,
      date: new Date().toISOString(),
      persons: [],
    });
    (component as any).attendanceId = 7;

    (component as any).route = { snapshot: { queryParamMap: { get: () => null } } };

    let initError: unknown;
    void (component as any).init().catch((e: unknown) => { initError = e; });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(initError).toBeUndefined();

    expect(db.getAttendanceByIdRobust).toHaveBeenCalledWith(7, { context: 'modal_open' });
    expect(component.attendance?.id).toBe(7);
  });
  it('shows the Werke even when the realtime subscribe throws', async () => {
    const db: any = dbServiceMock;
    db.checkToken = vi.fn().mockResolvedValue(undefined);
    db.canAccessFiles = vi.fn().mockReturnValue(false);
    db.getPersonIdForTenant = vi.fn().mockResolvedValue(null);
    db.getSongs = vi.fn().mockResolvedValue([{ id: 1, number: 1, name: 'Werk A' }]);
    db.getGroupCategories = vi.fn().mockResolvedValue([]);
    db.getConductors = vi.fn().mockResolvedValue([]);
    db.getHistoryByAttendanceId = vi.fn().mockResolvedValue([]);
    db.getAttendanceByIdRobust = vi.fn().mockResolvedValue({
      id: 7,
      date: new Date().toISOString(),
      persons: [],
    });
    (component as any).attendanceId = 7;
    (component as any).route = { snapshot: { queryParamMap: { get: () => null } } };
    vi.spyOn(component, 'subsribeOnChannels').mockImplementation(() => {
      throw new Error('cannot add `postgres_changes` callbacks for realtime:att-changes after `subscribe()`.');
    });

    await (component as any).init();

    expect(component.songs.map(s => s.id)).toEqual([1]);
    expect(component.filteredSongs.map(s => s.id)).toEqual([1]);
  });

  it('uses its own realtime topics so it does not reuse the Termine list channel', () => {
    const topics: string[] = [];
    const channel: any = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
    (dbServiceMock as any).getSupabase = vi.fn().mockReturnValue({
      channel: vi.fn((name: string) => { topics.push(name); return channel; }),
      removeChannel: vi.fn().mockResolvedValue('ok'),
    });

    component.subsribeOnChannels();

    expect(topics).toHaveLength(2);
    expect(topics).not.toContain('att-changes');
    expect(topics).not.toContain('person-changes');
  });
});
