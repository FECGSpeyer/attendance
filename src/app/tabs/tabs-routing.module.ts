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
        path: 'signout',
        loadChildren: () => import('./../selfService/signout/signout.module').then(m => m.SignoutPageModule),
        canActivate: [AuthGuard]
      },
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
        path: 'settings',
        loadChildren: () => import('./../settings/settings/settings.module').then(m => m.SettingsPageModule),
        canActivate: [AuthGuard],
      },
      {
        path: 'settings/teachers',
        loadChildren: () => import('./../teachers/teachers.module').then(m => m.TeachersPageModule),
        canActivate: [AuthGuard],
      },
      {
        path: 'settings/instruments',
        loadChildren: () => import('./../instruments/instrument-list/instrument-list.module').then(m => m.InstrumentListPageModule),
        canActivate: [AuthGuard],
      },
      {
        path: 'settings/songs',
        loadChildren: () => import('./../songs/songs.module').then(m => m.SongsPageModule),
        canActivate: [AuthGuard],
      },
      {
        path: 'settings/meetings',
        loadChildren: () => import('./../meetings/meeting-list/meeting-list.module').then(m => m.MeetingListPageModule),
        canActivate: [AuthGuard],
      },
      {
        path: 'settings/meetings/:id',
        loadChildren: () => import('./../meetings/meeting/meeting.module').then(m => m.MeetingPageModule),
        canActivate: [AuthGuard],
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
