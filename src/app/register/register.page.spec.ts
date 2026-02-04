import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { RegisterPage } from './register.page';
import { DbService } from 'src/app/services/db.service';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createModalControllerMock } from '../../testing/mocks/ionic.mock';

describe('RegisterPage', () => {
  let component: RegisterPage;
  let fixture: ComponentFixture<RegisterPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();

    await TestBed.configureTestingModule({
      declarations: [RegisterPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: ModalController, useValue: createModalControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty tenant', () => {
    expect(component.tenant.shortName).toBe('');
    expect(component.tenant.longName).toBe('');
  });
});
