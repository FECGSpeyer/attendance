import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';

import { ParentsPage } from './parents.page';
import { DbService } from '../../services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import { createActionSheetControllerMock } from '../../../testing/mocks/ionic.mock';

describe('ParentsPage', () => {
  let component: ParentsPage;
  let fixture: ComponentFixture<ParentsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ParentsPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
        { provide: ActionSheetController, useValue: createActionSheetControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ParentsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
