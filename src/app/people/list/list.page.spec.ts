import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ActionSheetController, AlertController, ModalController, IonRouterOutlet } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { Router } from '@angular/router';

import { ListPage } from './list.page';
import { DbService } from 'src/app/services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import {
  createAlertControllerMock,
  createModalControllerMock,
  createActionSheetControllerMock,
} from '../../../testing/mocks/ionic.mock';

describe('ListPage', () => {
  let component: ListPage;
  let fixture: ComponentFixture<ListPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockStorage = {
    create: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };

  const mockRouter = {
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
  };

  const mockRouterOutlet = {
    canGoBack: vi.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [ListPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: ActionSheetController, useValue: createActionSheetControllerMock() },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: IonRouterOutlet, useValue: mockRouterOutlet },
        { provide: Storage, useValue: mockStorage },
        { provide: Router, useValue: mockRouter },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ListPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty players array', () => {
    expect(component.players).toEqual([]);
    expect(component.playersFiltered).toEqual([]);
  });

  it('should have default filter options', () => {
    expect(component.filterOpt).toBe('all');
    expect(component.sortOpt).toBe('instrument');
  });

  it('should initialize with default view options', () => {
    expect(component.viewOpts).toContain('instrument');
  });
});
