import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController, IonRouterOutlet } from '@ionic/angular';

import { TeachersPage } from './teachers.page';
import { DbService } from '../services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createModalControllerMock } from '../../testing/mocks/ionic.mock';

describe('TeachersPage', () => {
  let component: TeachersPage;
  let fixture: ComponentFixture<TeachersPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  const mockRouterOutlet = {
    canGoBack: vi.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [TeachersPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: IonRouterOutlet, useValue: mockRouterOutlet },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(TeachersPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty arrays', () => {
    expect(component.teachers).toEqual([]);
    expect(component.players).toEqual([]);
  });
});
