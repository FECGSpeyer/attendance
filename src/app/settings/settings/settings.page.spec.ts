import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ActionSheetController, AlertController, ModalController, IonRouterOutlet } from '@ionic/angular';
import { Router } from '@angular/router';

import { SettingsPage } from './settings.page';
import { DbService } from 'src/app/services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import {
  createAlertControllerMock,
  createModalControllerMock,
  createActionSheetControllerMock,
} from '../../../testing/mocks/ionic.mock';

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockRouter = {
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
  };

  const mockRouterOutlet = {
    canGoBack: vi.fn().mockReturnValue(false),
    nativeEl: {},
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [SettingsPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: ActionSheetController, useValue: createActionSheetControllerMock() },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: IonRouterOutlet, useValue: mockRouterOutlet },
        { provide: Router, useValue: mockRouter },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty arrays', () => {
    expect(component.leftPlayers).toEqual([]);
    expect(component.viewers).toEqual([]);
    expect(component.parents).toEqual([]);
    expect(component.admins).toEqual([]);
  });

  it('should have version defined', () => {
    expect(component.version).toBeDefined();
  });
});
