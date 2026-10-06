import { hydrateRoot } from 'react-dom/client';
import { DashboardCanvas } from './components/dashboard/DashboardCanvas';
import './index.css';
import type { DashboardDataset, DashboardSpec } from './lib/dashboard/types';

const node = document.getElementById('dashboard-root');
const raw = document.getElementById('dashboard-state')?.textContent || '{}';
const state = JSON.parse(raw) as { spec: DashboardSpec; datasets: DashboardDataset[] };
if (node && state.spec) {
  document.documentElement.classList.toggle('dark', state.spec.theme.palette.mode === 'dark');
  document.documentElement.setAttribute('data-theme', state.spec.theme.palette.mode);
  hydrateRoot(node, <DashboardCanvas spec={state.spec} datasets={state.datasets} />);
}
