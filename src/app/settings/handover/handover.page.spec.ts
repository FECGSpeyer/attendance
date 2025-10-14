import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HandoverPage } from './handover.page';

describe('HandoverPage', () => {
  let component: HandoverPage;
  let fixture: ComponentFixture<HandoverPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HandoverPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
