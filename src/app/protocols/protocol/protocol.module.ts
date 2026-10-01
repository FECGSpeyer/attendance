import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';
import { ProtocolPageRoutingModule } from './protocol-routing.module';
import { ProtocolPage } from './protocol.page';
import { TiptapEditorComponent } from 'src/app/shared/tiptap-editor/tiptap-editor.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ProtocolPageRoutingModule,
    TiptapEditorComponent,
  ],
  declarations: [ProtocolPage],
  exports: [ProtocolPage],
})
export class ProtocolPageModule {}
