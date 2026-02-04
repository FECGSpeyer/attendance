import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController, AlertController } from '@ionic/angular';

import { StatsPage } from './stats.page';
import { DbService } from '../services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createModalControllerMock, createAlertControllerMock } from '../../testing/mocks/ionic.mock';

describe('StatsPage', () => {
  let component: StatsPage;
  let fixture: ComponentFixture<StatsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StatsPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: AlertController, useValue: createAlertControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(StatsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
