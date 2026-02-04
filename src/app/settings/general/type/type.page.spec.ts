import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController, AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';

import { TypePage } from './type.page';
import { DbService } from 'src/app/services/db.service';
import { DataService } from 'src/app/services/data.service';
import { createDbServiceMock } from '../../../../testing/mocks/db-service.mock';
import { createModalControllerMock, createAlertControllerMock } from '../../../../testing/mocks/ionic.mock';

describe('TypePage', () => {
  let component: TypePage;
  let fixture: ComponentFixture<TypePage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockRouter = {
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
  };

  const mockActivatedRoute = {
    snapshot: { paramMap: { get: vi.fn().mockReturnValue('1') } },
  };

  const mockDataService = {};

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [TypePage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: DataService, useValue: mockDataService },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(TypePage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have attendance statuses defined', () => {
    expect(component.attendanceStatuses.length).toBeGreaterThan(0);
  });
});
