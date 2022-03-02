import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'player',
        loadChildren: () => import('./../people/list/list.module').then(m => m.ListPageModule)
      },
      {
        path: 'attendance',
        loadChildren: () => import('./../attendance/att-list/att-list.module').then(m => m.AttListPageModule)
      },
      {
        path: 'instruments',
        loadChildren: () => import('./../instruments/instrument-list/instrument-list.module').then(m => m.InstrumentListPageModule)
      },
      {
        path: 'settings',
        loadChildren: () => import('./../settings/settings/settings.module').then(m => m.SettingsPageModule)
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
export class TabsPageRoutingModule {}
