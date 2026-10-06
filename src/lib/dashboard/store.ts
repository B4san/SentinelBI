import type { DashboardDataset, DashboardSpec } from './types';

export interface StoredDashboard {
  spec: DashboardSpec;
  datasets: DashboardDataset[];
}

export const dashboardStore = new Map<string, StoredDashboard>();

export function rememberDashboard(id: string, spec: DashboardSpec, datasets: DashboardDataset[]) {
  dashboardStore.set(id, { spec, datasets });
}
