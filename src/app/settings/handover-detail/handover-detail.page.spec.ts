import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AlertController, NavController } from '@ionic/angular';

import { HandoverDetailPage } from './handover-detail.page';
import { DbService } from 'src/app/services/db.service';
import { DataService } from 'src/app/services/data.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import { createAlertControllerMock, createNavControllerMock } from '../../../testing/mocks/ionic.mock';

describe('HandoverDetailPage', () => {
  let component: HandoverDetailPage;
  let fixture: ComponentFixture<HandoverDetailPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockDataService = {
    getHandoverData: vi.fn().mockReturnValue(null),
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [HandoverDetailPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: DataService, useValue: mockDataService },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: NavController, useValue: createNavControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(HandoverDetailPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
