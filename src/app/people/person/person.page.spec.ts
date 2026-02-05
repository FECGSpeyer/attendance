import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { PersonPage } from './person.page';
import { DbService } from '../../services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import { createModalControllerMock } from '../../../testing/mocks/ionic.mock';

describe('PersonPage', () => {
  let component: PersonPage;
  let fixture: ComponentFixture<PersonPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PersonPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
        { provide: ModalController, useValue: createModalControllerMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PersonPage);
    component = fixture.componentInstance;
    // Set required @Input
    component.player = { id: 1, firstName: 'Test', lastName: 'Player', tenantId: 1 } as any;
    component.groups = [];
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
