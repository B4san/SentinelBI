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
  const jsSources = assets?.js?.length ? assets.js : ['/src/entry-client-dashboard.tsx'];
  const js = jsSources.map((src) =>
    `<script type="module" src="${src}"></script>`,
  ).join('\n');
  const theme = spec.theme.palette.mode === 'dark' ? 'dark' : 'light';
  // Vite react-refresh preamble is only valid in the Vite dev server.
  // Inject it solely when the client entry is still a .tsx source (dev), never
  // when production hashed .js assets would 404 /@react-refresh.
  const isViteDevEntry = jsSources.some((src) => src.includes('.tsx'));
  const devPreamble = isViteDevEntry
    ? `<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>
<script type="module" src="/@vite/client"></script>`
    : '';
  return `<!DOCTYPE html>
<html lang="en" class="${theme}" data-theme="${theme}" data-accent="blue">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${spec.title}</title>
  ${css}
  ${devPreamble}
</head>
<body>
  <div id="dashboard-root">${body}</div>
  <script type="application/json" id="dashboard-state">${state}</script>
  ${js}
</body>
</html>`;
}
