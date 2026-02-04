import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';

import { ShiftPage } from './shift.page';
import { DbService } from 'src/app/services/db.service';
import { createDbServiceMock } from '../../../../../testing/mocks/db-service.mock';
import { createAlertControllerMock } from '../../../../../testing/mocks/ionic.mock';

describe('ShiftPage', () => {
  let component: ShiftPage;
  let fixture: ComponentFixture<ShiftPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockRouter = {
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
  };

  const mockActivatedRoute = {
    snapshot: { paramMap: { get: vi.fn().mockReturnValue('test-id') } },
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();
    // Set up shifts signal with a matching shift
    dbServiceMock.shifts.set([{ id: 'test-id', name: 'Test Shift', tenantId: 1 }] as any);

    await TestBed.configureTestingModule({
      declarations: [ShiftPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: AlertController, useValue: createAlertControllerMock() },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ShiftPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
