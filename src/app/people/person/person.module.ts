import { ImageViewerComponent } from 'src/app/shared/image-viewer/image-viewer.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { PersonPageRoutingModule } from './person-routing.module';

import { PersonPage } from './person.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    PersonPageRoutingModule,
    ImageViewerComponent
  ],
  declarations: [PersonPage]
})
export class PersonPageModule {}
