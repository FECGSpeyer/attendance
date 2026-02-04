import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ActionSheetController, AlertController, ModalController } from '@ionic/angular';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// Extend dayjs with utc plugin (needed by component)
dayjs.extend(utc);

import { PlanningPage } from './planning.page';
import { DbService } from '../services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import {
  createActionSheetControllerMock,
  createAlertControllerMock,
  createModalControllerMock,
} from '../../testing/mocks/ionic.mock';

describe('PlanningPage', () => {
  let component: PlanningPage;
  let fixture: ComponentFixture<PlanningPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [PlanningPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: ActionSheetController, useValue: createActionSheetControllerMock() },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PlanningPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with pdf type', () => {
    expect(component.type).toBe('pdf');
  });

  it('should have empty songs array', () => {
    expect(component.songs).toEqual([]);
  });
});
