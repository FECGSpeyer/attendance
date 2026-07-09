import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { LoginPageRoutingModule } from './login-routing.module';

import { LoginPage } from './login.page';
import { LegalModalComponent } from './legal-modal/legal-modal.component';
import { LegalContentComponent } from './legal-modal/legal-content.component';
import { RegisterModalComponent } from './register-modal/register-modal.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LoginPageRoutingModule,
    LegalContentComponent
  ],
  declarations: [LoginPage, LegalModalComponent, RegisterModalComponent]
})
export class LoginPageModule {}
