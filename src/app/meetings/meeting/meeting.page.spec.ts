import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { MeetingPage } from './meeting.page';
import { DbService } from '../../services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';

describe('MeetingPage', () => {
  let component: MeetingPage;
  let fixture: ComponentFixture<MeetingPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MeetingPage],
      providers: [
        { provide: DbService, useValue: createDbServiceMock() },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MeetingPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
