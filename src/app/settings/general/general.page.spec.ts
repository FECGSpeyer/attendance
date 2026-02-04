import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AlertController } from '@ionic/angular';

import { GeneralPage } from './general.page';
import { DbService } from 'src/app/services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import { createAlertControllerMock } from '../../../testing/mocks/ionic.mock';

describe('GeneralPage', () => {
  let component: GeneralPage;
  let fixture: ComponentFixture<GeneralPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [GeneralPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: AlertController, useValue: createAlertControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(GeneralPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have holiday states defined', () => {
    expect(component.holidayStates.length).toBeGreaterThan(0);
  });
});
