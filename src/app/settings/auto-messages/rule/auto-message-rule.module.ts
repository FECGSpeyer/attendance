import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { TranslocoModule } from '@jsverse/transloco';
import { MessageEditorComponent } from 'src/app/shared/message-editor/message-editor.component';
import { AutoMessageRulePage } from './auto-message-rule.page';

const routes: Routes = [{ path: '', component: AutoMessageRulePage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, TranslocoModule, MessageEditorComponent, RouterModule.forChild(routes)],
  declarations: [AutoMessageRulePage],
})
export class AutoMessageRulePageModule { }
