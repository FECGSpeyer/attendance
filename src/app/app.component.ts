import { Component, ViewChild } from '@angular/core';
import { IonRouterOutlet, Platform } from '@ionic/angular';
import { App } from '@capacitor/app';
import { Title } from '@angular/platform-browser';
import { environment } from 'src/environments/environment';
import { Storage } from '@ionic/storage-angular';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  @ViewChild(IonRouterOutlet, { static: true }) routerOutlet: IonRouterOutlet;

  constructor(
    private platform: Platform,
    private titleService: Title,
    private storage: Storage,
  ) {
    this.initializeApp();
    this.titleService.setTitle(environment.longName);
    document.body.classList.add(environment.symphonyImage ? "sinfo" : "blas");
  }

  async ngOnInit() {
    await this.storage.create();
  }

  initializeApp() {
    this.platform.backButton.subscribeWithPriority(-1, () => {
      if (!this.routerOutlet.canGoBack()) {
        App.exitApp();
      }
    });
  }
}
