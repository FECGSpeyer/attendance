import { ImageViewerComponent } from 'src/app/shared/image-viewer/image-viewer.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular/lazy';

import { FilesPageRoutingModule } from './files-routing.module';

import { FilesPage } from './files.page';
import { TranslocoModule } from '@jsverse/transloco';

@NgModule({
  imports: [
    TranslocoModule,
    CommonModule,
    FormsModule,
    IonicModule,
    FilesPageRoutingModule,
    ImageViewerComponent
  ],
  declarations: [FilesPage]
})
export class FilesPageModule {}
