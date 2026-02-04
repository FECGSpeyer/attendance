import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { AlertController, ModalController, Platform } from '@ionic/angular';
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
});
