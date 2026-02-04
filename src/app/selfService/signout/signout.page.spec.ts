import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { SignoutPage } from './signout.page';
import { DbService } from '../../services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import { createModalControllerMock } from '../../../testing/mocks/ionic.mock';

describe('SignoutPage', () => {
  let component: SignoutPage;
  let fixture: ComponentFixture<SignoutPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SignoutPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SignoutPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
