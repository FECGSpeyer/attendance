import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DbService } from 'src/app/services/db.service';
import { TeamTasksTabComponent } from './tasks-tab/tasks-tab.component';
import { TeamTopicsTabComponent } from './topics-tab/topics-tab.component';
import { TeamProtocolsTabComponent } from './protocols-tab/protocols-tab.component';

export type TeamOrgTab = 'tasks' | 'topics' | 'protocols';

/**
 * Teamorganisation: one page for leadership and members. RLS decides what each
 * person sees; the tabs only change their actions (leadership plans and writes,
 * members see their own tasks, suggestions and published protocols).
 */
@Component({
  selector: 'app-team-organization',
  templateUrl: './team-organization.page.html',
  styleUrls: ['./team-organization.page.scss'],
  standalone: false
})
export class TeamOrganizationPage {
  @ViewChild(TeamTasksTabComponent) tasksTab?: TeamTasksTabComponent;
  @ViewChild(TeamTopicsTabComponent) topicsTab?: TeamTopicsTabComponent;
  @ViewChild(TeamProtocolsTabComponent) protocolsTab?: TeamProtocolsTabComponent;

  public activeSegment: TeamOrgTab = 'tasks';
  private entered = false;

  constructor(
    public db: DbService,
    route: ActivatedRoute,
  ) {
    const tab = route.snapshot.queryParamMap.get('tab') as TeamOrgTab | null;
    if (tab && ['tasks', 'topics', 'protocols'].includes(tab)) {
      this.activeSegment = tab;
    }
    void this.db.loadTeamPerson();
  }

  async ionViewWillEnter() {
    // The tabs load themselves on init; only refresh when coming back.
    if (this.entered) {
      await this.reloadActive();
    }
    this.entered = true;
  }

  onSegmentChange(event: any) {
    this.activeSegment = event.detail.value;
  }

  async handleRefresh(event: any) {
    await this.reloadActive();
    event.target.complete();
  }

  private async reloadActive() {
    switch (this.activeSegment) {
      case 'tasks': return this.tasksTab?.reload();
      case 'topics': return this.topicsTab?.reload();
      case 'protocols': return this.protocolsTab?.reload();
    }
  }
}
