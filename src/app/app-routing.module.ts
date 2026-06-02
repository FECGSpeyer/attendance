import { NgModule } from '@angular/core';
import { NoPreloading, RouterModule, Routes } from '@angular/router';
import { LoginGuard } from './services/login.guard';
import { RegisterGuard } from 'src/app/services/register.guard';

const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./login/login.module').then(m => m.LoginPageModule),
    canActivate: [LoginGuard]
  },
  {
    path: 'register',
    loadChildren: () => import('./register/register.module').then(m => m.RegisterPageModule),
    canActivate: [RegisterGuard]
  },
  {
    path: 'register/:id',
    loadChildren: () => import('./register/tenant-register/tenant-register.module').then( m => m.TenantRegisterPageModule)
  },
  {
    path: 'legal',
    loadChildren: () => import('./legal/legal.module').then(m => m.LegalPageModule)
  },
  {
    // Public share link: auto-redirects to the App Store / Play Store based on
    // the user agent. Must be registered before the :songSharingId wildcard
    // below or it would be treated as a song-sharing id.
    path: 'app',
    loadChildren: () => import('./app-redirect/app-redirect.module').then(m => m.AppRedirectModule)
  },
  {
    path: ':songSharingId',
    loadChildren: () => import('./songs/songs.module').then( m => m.SongsPageModule)
  },
  {
    path: ':songSharingId/:songId',
    loadChildren: () => import('./songs/song/song.module').then( m => m.SongPageModule)
  },
];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: NoPreloading })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
