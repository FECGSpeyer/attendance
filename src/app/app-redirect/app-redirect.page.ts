import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';

const APP_STORE_URL = 'https://apps.apple.com/app/attendix/id6771119302';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=io.stephanus.attendix';

@Component({
  selector: 'app-app-redirect',
  templateUrl: './app-redirect.page.html',
  styleUrls: ['./app-redirect.page.scss'],
  standalone: false,
})
export class AppRedirectPage implements OnInit {
  // Shown when we can't confidently route to a single store (desktop / unknown UA).
  public showLanding = false;
  public readonly appStoreUrl = APP_STORE_URL;
  public readonly playStoreUrl = PLAY_STORE_URL;

  constructor(private router: Router) {}

  ngOnInit(): void {
    // If we somehow ended up here inside the installed app (Universal Link / App
    // Link routed through Angular), drop the user back into the normal flow.
    if (Capacitor.isNativePlatform()) {
      this.router.navigateByUrl('/login');
      return;
    }

    const ua = navigator.userAgent || '';
    // iPadOS 13+ reports as MacIntel — the touch-points check disambiguates it
    // from a real desktop Mac.
    const isIpadOs = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
    const isIos = /iPad|iPhone|iPod/.test(ua) || isIpadOs;
    const isAndroid = /android/i.test(ua);

    if (isIos) {
      window.location.replace(APP_STORE_URL);
      return;
    }
    if (isAndroid) {
      window.location.replace(PLAY_STORE_URL);
      return;
    }

    this.showLanding = true;
  }

  openAppStore(): void {
    window.location.href = APP_STORE_URL;
  }

  openPlayStore(): void {
    window.location.href = PLAY_STORE_URL;
  }
}
