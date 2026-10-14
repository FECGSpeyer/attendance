import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';

@Component({
  selector: 'app-team-topics-tab',
  templateUrl: './topics-tab.component.html',
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class TeamTopicsTabComponent {
  async reload(): Promise<void> {}
}
