import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../services/auth.guard';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'player',
        loadChildren: () => import('./../people/list/list.module').then(m => m.ListPageModule),
        canActivate: [AuthGuard],
      },
      {
        path: 'attendance',
        loadChildren: () => import('./../attendance/att-list/att-list.module').then(m => m.AttListPageModule),
        canActivate: [AuthGuard],
      },
      {
        path: 'instruments',
        loadChildren: () => import('./../instruments/instrument-list/instrument-list.module').then(m => m.InstrumentListPageModule),
        canActivate: [AuthGuard],
      },
      {
        path: 'settings',
        loadChildren: () => import('./../settings/settings/settings.module').then(m => m.SettingsPageModule),
        canActivate: [AuthGuard],
      },
      {
        path: 'teachers',
        loadChildren: () => import('./../teachers/teachers.module').then(m => m.TeachersPageModule)
      },
      {
        path: '',
        redirectTo: '/tabs/player',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '',
    redirectTo: '/tabs/player',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule { }
