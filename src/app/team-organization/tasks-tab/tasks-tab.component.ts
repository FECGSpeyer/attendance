import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular/lazy';

@Component({
  selector: 'app-team-tasks-tab',
  templateUrl: './tasks-tab.component.html',
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class TeamTasksTabComponent {
  async reload(): Promise<void> {}
}
