import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';

@Component({
  selector: 'app-team-protocols-tab',
  templateUrl: './protocols-tab.component.html',
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class TeamProtocolsTabComponent {
  async reload(): Promise<void> {}
}
