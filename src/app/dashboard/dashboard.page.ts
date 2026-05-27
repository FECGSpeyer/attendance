import { Component, OnInit } from '@angular/core';
import dayjs from 'dayjs';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { supabase } from '../services/base/supabase';

Chart.register(...registerables);

type RangeKey = '7d' | '30d' | '90d';
interface UsageEventRow {
  event_name: string;
  tenant_id: number | null;
  device_type: 'ios' | 'android' | 'web' | null;
  created_at: string;
}

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
      const { data, error } = await supabase
        .from('usage_events')
        .select('event_name, tenant_id, device_type, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (error) {
        this.hasData = false;
        return;
      }

      const rows = (data ?? []) as UsageEventRow[];
      this.hasData = rows.length > 0;
      this.computeKpis(rows);
      this.buildCharts(rows);
    } finally {
      this.loading = false;
    }
  }

  private computeKpis(rows: UsageEventRow[]) {
    this.totalEvents = rows.length;
    const tenantSet = new Set<number>();
    rows.forEach(r => { if (r.tenant_id != null) tenantSet.add(r.tenant_id); });
    this.distinctTenants = tenantSet.size;

    const last7Cutoff = dayjs().subtract(7, 'day');
    const active = new Set<number>();
    rows.forEach(r => {
      if (r.tenant_id != null && dayjs(r.created_at).isAfter(last7Cutoff)) {
        active.add(r.tenant_id);
      }
    });
    this.activeTenantsLast7 = active.size;

    const counts = new Map<string, number>();
    rows.forEach(r => counts.set(r.event_name, (counts.get(r.event_name) ?? 0) + 1));
    let topName = '—';
    let topCount = 0;
    counts.forEach((c, name) => { if (c > topCount) { topCount = c; topName = name; } });
    this.topEvent = topName;
  }

  private buildCharts(rows: UsageEventRow[]) {
    const days = this.rangeDays();
    const labels: string[] = [];
    const dayCounts = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
      labels.push(dayjs(d).format('DD.MM.'));
      dayCounts.set(d, 0);
    }
    rows.forEach(r => {
      const k = dayjs(r.created_at).format('YYYY-MM-DD');
      if (dayCounts.has(k)) dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
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

    const counts = new Map<string, number>();
    rows.forEach(r => counts.set(r.event_name, (counts.get(r.event_name) ?? 0) + 1));
    const sortedNames = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    this.eventsByNameData = {
      labels: sortedNames.map(([name]) => name),
      datasets: [{
        label: 'Events',
        data: sortedNames.map(([, c]) => c),
        backgroundColor: sortedNames.map((_, i) => PALETTE[i % PALETTE.length]),
      }],
    };
    this.eventsByNameOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
    };

    const tenantCounts = new Map<number, number>();
    rows.forEach(r => {
      if (r.tenant_id != null) tenantCounts.set(r.tenant_id, (tenantCounts.get(r.tenant_id) ?? 0) + 1);
    });
    const sortedTenants = Array.from(tenantCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    this.topTenantsData = {
      labels: sortedTenants.map(([id]) => `#${id}`),
      datasets: [{
        label: 'Events',
        data: sortedTenants.map(([, c]) => c),
        backgroundColor: sortedTenants.map((_, i) => PALETTE[i % PALETTE.length]),
      }],
    };
    this.topTenantsOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    };

    this.eventDistributionData = {
      labels: sortedNames.map(([name]) => name),
      datasets: [{
        data: sortedNames.map(([, c]) => c),
        backgroundColor: sortedNames.map((_, i) => PALETTE[i % PALETTE.length]),
      }],
    };
    this.eventDistributionOptions = {
      responsive: true,
      maintainAspectRatio: false,
    };

    const deviceCounts = new Map<string, number>();
    rows.forEach(r => {
      const k = r.device_type ?? 'unknown';
      deviceCounts.set(k, (deviceCounts.get(k) ?? 0) + 1);
    });
    const deviceColors: Record<string, string> = { ios: '#a2aaad', android: '#3ddc84', web: '#3880ff', unknown: '#c9cbcf' };
    const deviceLabels = Array.from(deviceCounts.keys());
    this.deviceTypeData = {
      labels: deviceLabels,
      datasets: [{
        data: deviceLabels.map(k => deviceCounts.get(k) ?? 0),
        backgroundColor: deviceLabels.map(k => deviceColors[k] ?? '#999'),
      }],
    };
    this.deviceTypeOptions = {
      responsive: true,
      maintainAspectRatio: false,
    };
  }
}
