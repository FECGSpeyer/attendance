import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { TranslocoModule } from '@jsverse/transloco';
import { AutoMessageListPage } from './auto-message-list.page';

const routes: Routes = [{ path: '', component: AutoMessageListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, TranslocoModule, RouterModule.forChild(routes)],
  declarations: [AutoMessageListPage],
})
export class AutoMessageListPageModule { }
