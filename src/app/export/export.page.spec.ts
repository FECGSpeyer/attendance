import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController, AlertController } from '@ionic/angular';

import { ExportPage } from './export.page';
import { DbService } from '../services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createModalControllerMock, createAlertControllerMock } from '../../testing/mocks/ionic.mock';

describe('ExportPage', () => {
  let component: ExportPage;
  let fixture: ComponentFixture<ExportPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ExportPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: AlertController, useValue: createAlertControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ExportPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
