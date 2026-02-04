import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AlertController, ModalController, IonRouterOutlet } from '@ionic/angular';

import { AttListPage } from './att-list.page';
import { DbService } from 'src/app/services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import {
  createAlertControllerMock,
  createModalControllerMock,
} from '../../../testing/mocks/ionic.mock';

describe('AttListPage', () => {
  let component: AttListPage;
  let fixture: ComponentFixture<AttListPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockRouterOutlet = {
    canGoBack: vi.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [AttListPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: IonRouterOutlet, useValue: mockRouterOutlet },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AttListPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default values', () => {
    expect(component.attendances).toEqual([]);
    expect(component.type).toBe('uebung');
  });
});
