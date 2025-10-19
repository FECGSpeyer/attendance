import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TypePage } from './type.page';

describe('TypePage', () => {
  let component: TypePage;
  let fixture: ComponentFixture<TypePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TypePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
