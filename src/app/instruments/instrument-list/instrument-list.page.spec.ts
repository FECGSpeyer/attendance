import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AlertController, ModalController, IonRouterOutlet } from '@ionic/angular';

import { InstrumentListPage } from './instrument-list.page';
import { DbService } from 'src/app/services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import {
  createAlertControllerMock,
  createModalControllerMock,
} from '../../../testing/mocks/ionic.mock';

describe('InstrumentListPage', () => {
  let component: InstrumentListPage;
  let fixture: ComponentFixture<InstrumentListPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockRouterOutlet = {
    canGoBack: vi.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [InstrumentListPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: IonRouterOutlet, useValue: mockRouterOutlet },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(InstrumentListPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty instruments array', () => {
    expect(component.instruments).toEqual([]);
  });
});
