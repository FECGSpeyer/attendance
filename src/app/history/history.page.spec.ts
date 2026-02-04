import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController, AlertController } from '@ionic/angular';

import { HistoryPage } from './history.page';
import { DbService } from '../services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createModalControllerMock, createAlertControllerMock } from '../../testing/mocks/ionic.mock';

describe('HistoryPage', () => {
  let component: HistoryPage;
  let fixture: ComponentFixture<HistoryPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HistoryPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: AlertController, useValue: createAlertControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
