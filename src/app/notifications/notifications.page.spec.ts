import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AlertController } from '@ionic/angular';

import { NotificationsPage } from './notifications.page';
import { DbService } from '../services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createAlertControllerMock } from '../../testing/mocks/ionic.mock';

describe('NotificationsPage', () => {
  let component: NotificationsPage;
  let fixture: ComponentFixture<NotificationsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationsPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
        { provide: AlertController, useValue: createAlertControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
