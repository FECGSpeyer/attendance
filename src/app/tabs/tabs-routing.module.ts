import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../services/auth.guard';
import { SuperDeveloperGuard } from '../services/super-developer.guard';
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
        path: 'overview',
        loadChildren: () => import('./../selfService/overview/overview.module').then(m => m.OverviewPageModule),
      },
      {
        path: 'members',
        loadChildren: () => import('./../people/members/members.module').then(m => m.MembersPageModule),
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
        path: 'attendance/:id',
        loadChildren: () => import('./../attendance/attendance/attendance.module').then(m => m.AttendancePageModule),
      },
      {
        path: 'songs-tab',
        loadChildren: () => import('./../songs/songs.module').then(m => m.SongsPageModule),
      },
      {
        path: 'songs-tab/:id',
        loadChildren: () => import('./../songs/song/song.module').then(m => m.SongPageModule),
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
        path: 'settings/songs/:id',
        loadChildren: () => import('./../songs/song/song.module').then(m => m.SongPageModule)
      },
      {
        path: 'settings/files',
        loadChildren: () => import('./../settings/files/files.module').then(m => m.FilesPageModule),
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
        path: 'settings/handover',
        loadChildren: () => import('./../settings/handover/handover.module').then(m => m.HandoverPageModule)
      },
      {
        path: 'settings/handover/detail',
        loadChildren: () => import('./../settings/handover-detail/handover-detail.module').then(m => m.HandoverDetailPageModule)
      },
      {
        path: 'settings/general',
        loadChildren: () => import('./../settings/general/general.module').then(m => m.GeneralPageModule)
      },
      {
        path: 'settings/general/types',
        loadChildren: () => import('./../settings/general/types/types.module').then(m => m.TypesPageModule)
      },
      {
        path: 'settings/general/types/:id',
        loadChildren: () => import('./../settings/general/type/type.module').then(m => m.TypePageModule)
      },
      {
        path: 'settings/general/branding',
        loadChildren: () => import('./../settings/general/branding/branding.module').then(m => m.BrandingPageModule)
      },
      {
        path: 'settings/general/extra-fields',
        loadChildren: () => import('./../settings/general/extra-fields/extra-fields.module').then(m => m.ExtraFieldsPageModule)
      },
      {
        path: 'settings/voice-leader',
        loadChildren: () => import('./../settings/voice-leader/voice-leader.module').then(m => m.VoiceLeaderPageModule)
      },
      {
        path: 'settings/role-permissions',
        loadChildren: () => import('./../settings/role-permissions/role-permissions.module').then(m => m.RolePermissionsPageModule)
      },
      {
        path: 'settings/delete-account',
        loadChildren: () => import('./../settings/delete-account/delete-account.module').then(m => m.DeleteAccountPageModule)
      },
      {
        path: 'org-plans',
        loadChildren: () => import('./../org-plans/org-plans.module').then(m => m.OrgPlansPageModule)
      },
      {
        path: 'org-plans/planung',
        loadChildren: () => import('./../public-planning/public-planning.module').then(m => m.PublicPlanningPageModule)
      },
      {
        path: 'settings/org-plans',
        loadChildren: () => import('./../org-plans/org-plans.module').then(m => m.OrgPlansPageModule)
      },
      {
        path: 'settings/org-plans/planung',
        loadChildren: () => import('./../public-planning/public-planning.module').then(m => m.PublicPlanningPageModule)
      },
      {
        path: 'settings/org-settings',
        loadChildren: () => import('./../org-settings/org-settings.module').then(m => m.OrgSettingsPageModule)
      },
      {
        path: 'settings/org-settings/branding',
        loadChildren: () => import('./../settings/general/branding/branding.module').then(m => m.BrandingPageModule)
      },
      {
        path: 'settings/planung',
        loadChildren: () => import('./../public-planning/public-planning.module').then(m => m.PublicPlanningPageModule)
      },
      {
        path: 'dashboard',
        canActivate: [SuperDeveloperGuard],
        loadChildren: () => import('./../dashboard/dashboard.module').then(m => m.DashboardPageModule)
      },
      {
        path: 'home-dashboard',
        loadChildren: () => import('./../home-dashboard/home-dashboard.module').then(m => m.HomeDashboardPageModule)
      },
      {
        path: 'settings/dashboard',
        loadChildren: () => import('./../settings/dashboard/dashboard-settings.module').then(m => m.DashboardSettingsPageModule)
      },
      {
        path: 'parents',
        loadChildren: () => import('./../selfService/parents/parents.module').then(m => m.ParentsPageModule)
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
