import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { OrgSongsPage } from './org-songs.page';
import { OrgSongsPageRoutingModule } from './org-songs-routing.module';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    OrgSongsPageRoutingModule,
  ],
  declarations: [OrgSongsPage],
})
export class OrgSongsPageModule {}
