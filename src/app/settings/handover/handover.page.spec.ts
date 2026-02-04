import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { NavController } from '@ionic/angular';

import { HandoverPage } from './handover.page';
import { DbService } from 'src/app/services/db.service';
import { DataService } from 'src/app/services/data.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import { createNavControllerMock } from '../../../testing/mocks/ionic.mock';

describe('HandoverPage', () => {
  let component: HandoverPage;
  let fixture: ComponentFixture<HandoverPage>;

  beforeEach(async () => {
    const dbServiceMock = createDbServiceMock();
    // Ensure getMainGroup returns an object with id
    dbServiceMock.getMainGroup.mockReturnValue({ id: 1, name: 'Main', tenantId: 1 });

    const mockDataService = {
      getHandoverData: vi.fn().mockReturnValue(null),
      setHandoverData: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [HandoverPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: DataService, useValue: mockDataService },
        { provide: NavController, useValue: createNavControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(HandoverPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
