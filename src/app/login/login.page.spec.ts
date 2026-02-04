import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AlertController } from '@ionic/angular';
import { LoginPage } from './login.page';
import { createDbServiceMock } from '../../testing/mocks/db-service.mock';
import { createAlertControllerMock } from '../../testing/mocks/ionic.mock';
import { DbService } from '../services/db.service';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let dbServiceMock: ReturnType<typeof createDbServiceMock>;
  let alertControllerMock: ReturnType<typeof createAlertControllerMock>;

  beforeEach(async () => {
    dbServiceMock = createDbServiceMock();
    alertControllerMock = createAlertControllerMock();

    await TestBed.configureTestingModule({
      declarations: [LoginPage],
      imports: [RouterTestingModule, FormsModule, ReactiveFormsModule],
      providers: [
        { provide: DbService, useValue: dbServiceMock },
        { provide: AlertController, useValue: alertControllerMock },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;

    // Mock the ViewChild elements
    component.emailInput = { getInputElement: vi.fn().mockResolvedValue({ addEventListener: vi.fn() }) } as any;
    component.passwordInput = { getInputElement: vi.fn().mockResolvedValue({ addEventListener: vi.fn() }) } as any;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have empty credentials initially', () => {
    expect(component.registerCredentials.email).toBe('');
    expect(component.registerCredentials.password).toBe('');
  });

  it('should initialize login form on ngOnInit', async () => {
    await component.ngOnInit();
    expect(component.loginForm).toBeDefined();
    expect(component.loginForm.get('user')).toBeDefined();
    expect(component.loginForm.get('password')).toBeDefined();
  });

  it('should show password reset alert', async () => {
    await component.forgotPassword();
    expect(alertControllerMock.create).toHaveBeenCalled();
  });
});
