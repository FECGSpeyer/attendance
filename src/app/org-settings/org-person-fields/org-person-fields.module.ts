import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { OrgPersonFieldsPage } from './org-person-fields.page';
import { OrgPersonFieldsPageRoutingModule } from './org-person-fields-routing.module';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    OrgPersonFieldsPageRoutingModule,
  ],
  declarations: [OrgPersonFieldsPage],
})
export class OrgPersonFieldsPageModule {}
