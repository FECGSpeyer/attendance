import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../services/auth.guard';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'signout',
        loadChildren: () => import('./../selfService/signout/signout.module').then(m => m.SignoutPageModule),
      },
      {
        path: 'player',
        loadChildren: () => import('./../people/list/list.module').then(m => m.ListPageModule),
      },
      {
        path: 'attendance',
        loadChildren: () => import('./../attendance/att-list/att-list.module').then(m => m.AttListPageModule),
      },
      {
        path: 'settings',
        loadChildren: () => import('./../settings/settings/settings.module').then(m => m.SettingsPageModule),
      },
      {
        path: 'settings/teachers',
        loadChildren: () => import('./../teachers/teachers.module').then(m => m.TeachersPageModule),
      },
      {
        path: 'settings/instruments',
        loadChildren: () => import('./../instruments/instrument-list/instrument-list.module').then(m => m.InstrumentListPageModule),
      },
      {
        path: 'settings/songs',
        loadChildren: () => import('./../songs/songs.module').then(m => m.SongsPageModule),
      },
      {
        path: 'settings/meetings',
        loadChildren: () => import('./../meetings/meeting-list/meeting-list.module').then(m => m.MeetingListPageModule),
      },
      {
        path: 'settings/meetings/:id',
        loadChildren: () => import('./../meetings/meeting/meeting.module').then(m => m.MeetingPageModule),
      },
      {
        path: 'settings/notifications',
        loadChildren: () => import('./../notifications/notifications.module').then(m => m.NotificationsPageModule)
      },
      {
        path: 'settings/register',
        loadChildren: () => import('./../register/register.module').then(m => m.RegisterPageModule)
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
