import { Component, OnInit } from '@angular/core';
import dayjs from 'dayjs';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { supabase } from '../services/base/supabase';
import { TrackingEvent } from '../services/tracking/tracking.service';
import { Database } from '../utilities/supabase';

Chart.register(...registerables);

// Row shapes returned by the usage_* aggregation RPCs, derived from the
// generated DB types so they stay in sync with the SQL.
type Fns = Database['public']['Functions'];
type UsageKpis = Fns['usage_kpis']['Returns'][number];
type PerDayRow = Fns['usage_events_per_day']['Returns'][number];
type ByNameRow = Fns['usage_events_by_name']['Returns'][number];
type ByTenantRow = Fns['usage_events_by_tenant']['Returns'][number];
type ByDeviceRow = Fns['usage_events_by_device']['Returns'][number];

type RangeKey = '7d' | '30d' | '90d';

// The current app's event names, passed to the aggregation RPCs so stale names
// from older app versions (removed/renamed events still sitting in the table)
// are excluded. Single source of truth for "what the app tracks today".
const KNOWN_EVENTS: string[] = Object.values(TrackingEvent);

const PALETTE = ['#2dd36f', '#3880ff', '#ffc409', '#eb445a', '#5260ff', '#ff9f0a', '#36a2eb', '#9966ff', '#4bc0c0', '#ff9f40', '#c9cbcf', '#aaff80'];

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class DashboardPage implements OnInit {
  public range: RangeKey = '30d';
  public loading = true;
  public hasData = false;

  public totalEvents = 0;
  public distinctTenants = 0;
  public activeTenantsLast7 = 0;
  public topEvent = '—';

  public eventsPerDayData: ChartData<'line'>;
  public eventsPerDayOptions: ChartConfiguration<'line'>['options'];
  public eventsByNameData: ChartData<'bar'>;
  public eventsByNameOptions: ChartConfiguration<'bar'>['options'];
  public topTenantsData: ChartData<'bar'>;
  public topTenantsOptions: ChartConfiguration<'bar'>['options'];
  public eventDistributionData: ChartData<'doughnut'>;
  public eventDistributionOptions: ChartConfiguration<'doughnut'>['options'];
  public deviceTypeData: ChartData<'doughnut'>;
  public deviceTypeOptions: ChartConfiguration<'doughnut'>['options'];

  async ngOnInit() {
    await this.load();
  }

  async onRangeChange(value: RangeKey) {
    this.range = value;
    await this.load();
  }

  private rangeDays(): number {
    return this.range === '7d' ? 7 : this.range === '90d' ? 90 : 30;
  }

  async load() {
    this.loading = true;
    try {
      const since = dayjs().subtract(this.rangeDays(), 'day').toISOString();
      const params = { p_since: since, p_events: KNOWN_EVENTS };

      // Aggregate server-side. Counting raw rows client-side hit PostgREST's
      // 1000-row cap, so every range returned the same truncated 1000 events
      // and all metrics were wrong. These RPCs GROUP BY in SQL — exact counts,
      // no row cap.
      const [kpis, perDay, byName, byTenant, byDevice] = await Promise.all([
        supabase.rpc('usage_kpis', params),
        supabase.rpc('usage_events_per_day', params),
        supabase.rpc('usage_events_by_name', params),
        supabase.rpc('usage_events_by_tenant', params),
        supabase.rpc('usage_events_by_device', params),
      ]);

      if (kpis.error || perDay.error || byName.error || byTenant.error || byDevice.error) {
        this.hasData = false;
        return;
      }

      const kpiRow = (kpis.data ?? [])[0];
      const perDayRows = perDay.data ?? [];
      const byNameRows = byName.data ?? [];
      const byTenantRows = byTenant.data ?? [];
      const byDeviceRows = byDevice.data ?? [];

      this.hasData = Number(kpiRow?.total_events ?? 0) > 0;
      this.computeKpis(kpiRow, byNameRows);
      this.buildCharts(perDayRows, byNameRows, byTenantRows, byDeviceRows);
    } finally {
      this.loading = false;
    }
  }

  private computeKpis(kpi: UsageKpis | undefined, byName: ByNameRow[]) {
    this.totalEvents = Number(kpi?.total_events ?? 0);
    this.distinctTenants = Number(kpi?.distinct_tenants ?? 0);
    this.activeTenantsLast7 = Number(kpi?.active_tenants_7d ?? 0);
    // byName is returned already sorted by count desc.
    this.topEvent = byName.length > 0 ? byName[0].event_name : '—';
  }

  private buildCharts(
    perDay: PerDayRow[],
    byName: ByNameRow[],
    byTenant: ByTenantRow[],
    byDevice: ByDeviceRow[],
  ) {
    const days = this.rangeDays();
    const labels: string[] = [];
    const dayCounts = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
      labels.push(dayjs(d).format('DD.MM.'));
      dayCounts.set(d, 0);
    }
    perDay.forEach(r => {
      const k = dayjs(r.day).format('YYYY-MM-DD');
      if (dayCounts.has(k)) dayCounts.set(k, Number(r.count));
    });
    this.eventsPerDayData = {
      labels,
      datasets: [{
        label: 'Events',
        data: Array.from(dayCounts.values()),
        borderColor: PALETTE[1],
        backgroundColor: PALETTE[1] + '33',
        fill: true,
        tension: 0.3,
      }],
    };
    this.eventsPerDayOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    };

    const sortedNames = byName.slice(0, 10);
    this.eventsByNameData = {
      labels: sortedNames.map(r => r.event_name),
      datasets: [{
        label: 'Events',
        data: sortedNames.map(r => Number(r.count)),
        backgroundColor: sortedNames.map((_, i) => PALETTE[i % PALETTE.length]),
      }],
    };
    this.eventsByNameOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
    };

    const sortedTenants = byTenant.slice(0, 10);
    this.topTenantsData = {
      labels: sortedTenants.map(r => `#${r.tenant_id}`),
      datasets: [{
        label: 'Events',
        data: sortedTenants.map(r => Number(r.count)),
        backgroundColor: sortedTenants.map((_, i) => PALETTE[i % PALETTE.length]),
      }],
    };
    this.topTenantsOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    };

    this.eventDistributionData = {
      labels: sortedNames.map(r => r.event_name),
      datasets: [{
        data: sortedNames.map(r => Number(r.count)),
        backgroundColor: sortedNames.map((_, i) => PALETTE[i % PALETTE.length]),
      }],
    };
    this.eventDistributionOptions = {
      responsive: true,
      maintainAspectRatio: false,
    };

    const deviceColors: Record<string, string> = { ios: '#a2aaad', android: '#3ddc84', web: '#3880ff', unknown: '#c9cbcf' };
    const deviceLabels = byDevice.map(r => r.device_type);
    this.deviceTypeData = {
      labels: deviceLabels,
      datasets: [{
        data: byDevice.map(r => Number(r.count)),
        backgroundColor: deviceLabels.map(k => deviceColors[k] ?? '#999'),
      }],
    };
    this.deviceTypeOptions = {
      responsive: true,
      maintainAspectRatio: false,
    };
  }
}
