import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShiftPage } from './shift.page';

describe('ShiftPage', () => {
  let component: ShiftPage;
  let fixture: ComponentFixture<ShiftPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ShiftPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
