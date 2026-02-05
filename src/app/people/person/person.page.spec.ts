import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';

import { PersonPage } from './person.page';
import { DbService } from '../../services/db.service';
import { createDbServiceMock } from '../../../testing/mocks/db-service.mock';
import { createModalControllerMock, createAlertControllerMock } from '../../../testing/mocks/ionic.mock';

describe('PersonPage', () => {
  let component: PersonPage;
  let fixture: ComponentFixture<PersonPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;
  let alertControllerMock: ReturnType<typeof createAlertControllerMock>;

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();
    alertControllerMock = createAlertControllerMock();

    await TestBed.configureTestingModule({
      declarations: [PersonPage],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: ModalController, useValue: createModalControllerMock() },
        { provide: AlertController, useValue: alertControllerMock },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PersonPage);
    component = fixture.componentInstance;
    // Set required @Input
    component.player = {
      id: 1,
      firstName: 'Test',
      lastName: 'Player',
      tenantId: 1,
      lastSolve: null,
    } as any;
    component.existingPlayer = { ...component.player };
    component.groups = [];
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('lateCount tracking', () => {
    it('should initialize lateCount to 0', () => {
      expect(component.lateCount).toBe(0);
    });

    it('should initialize lateExcusedCount to 0', () => {
      expect(component.lateExcusedCount).toBe(0);
    });
  });

  describe('resetLateCount', () => {
    it('should show confirmation alert when called', async () => {
      await component.resetLateCount();

      expect(alertControllerMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          header: 'Verspätungszähler zurücksetzen?',
          buttons: expect.arrayContaining([
            expect.objectContaining({ text: 'Abbrechen', role: 'cancel' }),
            expect.objectContaining({ text: 'Zurücksetzen' }),
          ]),
        })
      );
    });

    it('should update lastSolve and reset counts when confirmed', async () => {
      // Setup: player has late arrivals
      component.lateCount = 5;
      component.lateExcusedCount = 2;

      // Mock Supabase update to succeed
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });
      dbServiceMock.getSupabase.mockReturnValue({
        from: vi.fn().mockReturnValue({ update: mockUpdate }),
      } as any);

      // Trigger the reset
      await component.resetLateCount();

      // Simulate clicking "Zurücksetzen" button in the alert
      const alertButtons = alertControllerMock.create.mock.calls[0][0].buttons;
      const confirmButton = alertButtons.find((b: any) => b.text === 'Zurücksetzen');
      await confirmButton.handler();

      // Verify counts are reset
      expect(component.lateCount).toBe(0);
      expect(component.lateExcusedCount).toBe(0);
      expect(component.player.lastSolve).toBeTruthy();
      expect(component.existingPlayer.lastSolve).toBeTruthy();
    });
  });
});
