import { renderToString } from 'react-dom/server';
import { DashboardCanvas } from './components/dashboard/DashboardCanvas';
import type { DashboardDataset, DashboardSpec } from './lib/dashboard/types';

export function renderDashboard(spec: DashboardSpec, datasets: DashboardDataset[]): string {
  return renderToString(
    <DashboardCanvas spec={spec} datasets={datasets} ssr />,
  );
}

export function renderDashboardDocument(spec: DashboardSpec, datasets: DashboardDataset[], assets?: { css?: string[]; js?: string[] }): string {
  const body = renderDashboard(spec, datasets);
  const state = JSON.stringify({ spec, datasets }).replace(/</g, '\\u003c');
  const css = (assets?.css || []).map((href) => `<link rel="stylesheet" href="${href}">`).join('\n');
  const js = (assets?.js || ['/src/entry-client-dashboard.tsx']).map((src) =>
    `<script type="module" src="${src}"></script>`,
  ).join('\n');
  const theme = spec.theme.palette.mode === 'dark' ? 'dark' : 'light';
  return `<!DOCTYPE html>
<html lang="en" class="${theme}" data-theme="${theme}" data-accent="blue">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${spec.title}</title>
  ${css}
</head>
<body>
  <div id="dashboard-root">${body}</div>
  <script type="application/json" id="dashboard-state">${state}</script>
  ${js}
</body>
</html>`;
}
