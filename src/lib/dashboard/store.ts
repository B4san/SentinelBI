import fs from 'node:fs';
import path from 'node:path';
import type { DashboardDataset, DashboardSpec } from './types';

export interface StoredDashboard {
  spec: DashboardSpec;
  datasets: DashboardDataset[];
}

export const dashboardStore = new Map<string, StoredDashboard>();

const DIR = path.join(process.cwd(), 'data', 'dashboards');

function persistDir(): string {
  try {
    fs.mkdirSync(DIR, { recursive: true });
  } catch {
    // in-memory only when the filesystem is read-only
  }
  return DIR;
}

export function rememberDashboard(id: string, spec: DashboardSpec, datasets: DashboardDataset[]) {
  const stored = { spec, datasets };
  dashboardStore.set(id, stored);
  try {
    const file = path.join(persistDir(), `${id}.json`);
    fs.writeFileSync(file, JSON.stringify({ spec, datasets }, null, 2));
  } catch {
    // Storage is in-memory only when disk writes fail.
  }
}

export function loadDashboard(id: string): StoredDashboard | undefined {
  const memory = dashboardStore.get(id);
  if (memory) return memory;
  try {
    const file = path.join(DIR, `${id}.json`);
    if (!fs.existsSync(file)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredDashboard;
    dashboardStore.set(id, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}
