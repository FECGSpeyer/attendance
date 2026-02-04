import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { TeacherPage } from './teacher.page';
import { DbService } from '../services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createModalControllerMock } from '../../testing/mocks/ionic.mock';

describe('TeacherPage', () => {
  let component: TeacherPage;
  let fixture: ComponentFixture<TeacherPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [TeacherPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: ModalController, useValue: createModalControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(TeacherPage);
    component = fixture.componentInstance;

    // Set required @Input values before detectChanges
    component.teacher = { id: 1, firstName: 'Test', lastName: 'Teacher', tenantId: 1, email: '' };
    component.players = [];

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should copy teacher on init', () => {
    expect(component.editedTeacher).toBeDefined();
    expect(component.editedTeacher.firstName).toBe('Test');
  });
});
