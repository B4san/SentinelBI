import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DashboardDataset, DashboardSpec } from '../lib/dashboard/types';

export interface DashboardAssets {
  css?: string[];
  js?: string[];
}

export interface DashboardRenderer {
  renderDashboard: (spec: DashboardSpec, datasets: DashboardDataset[]) => string | Promise<string>;
  renderDashboardDocument: (
    spec: DashboardSpec,
    datasets: DashboardDataset[],
    assets?: DashboardAssets,
  ) => string | Promise<string>;
}

export type LoadRenderer = () => Promise<DashboardRenderer>;

function readManifestAssets(): DashboardAssets | undefined {
  try {
    const manifestPath = path.join(process.cwd(), 'dist/.vite/manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<
        string,
        { file: string; css?: string[]; imports?: string[] }
      >;
      const entry = manifest['src/entry-client-dashboard.tsx'] || manifest['src/entry-client-dashboard.ts'];
      const main = manifest['index.html'];
      const css = new Set<string>();
      const addCss = (item?: { css?: string[]; imports?: string[] }) => {
        for (const href of item?.css || []) css.add(href.startsWith('/') ? href : `/${href}`);
        for (const id of item?.imports || []) addCss(manifest[id]);
      };
      addCss(entry);
      addCss(main);
      const js = entry?.file ? [entry.file.startsWith('/') ? entry.file : `/${entry.file}`] : [];
      if (js.length) return { css: [...css], js };
    }
    const html = fs.readFileSync(path.join(process.cwd(), 'dist/index.html'), 'utf8');
    const css = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
    const js = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
    return { css, js };
  } catch {
    return undefined;
  }
}

export function prodAssets(): DashboardAssets | undefined {
  return readManifestAssets();
}

export async function loadProductionRenderer(): Promise<DashboardRenderer> {
  const ssrPath = path.join(process.cwd(), 'dist/ssr/entry-server.js');
  if (!fs.existsSync(ssrPath)) {
    throw new Error(`SSR bundle missing at ${ssrPath}`);
  }
  return import(pathToFileURL(ssrPath).href) as Promise<DashboardRenderer>;
}

export function shareExpiredHtml(id: string): string {
  const safeId = String(id || '').replace(/[<>&"]/g, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Share link expired</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f4f7fb; color: #0f172a; }
    @media (prefers-color-scheme: dark) { body { background: #0b1220; color: #e8eef7; } }
    main { max-width: 28rem; padding: 2rem; }
    h1 { font-size: 1.5rem; letter-spacing: -0.03em; margin: 0 0 0.75rem; }
    p { color: #64748b; line-height: 1.5; margin: 0 0 1.25rem; }
    @media (prefers-color-scheme: dark) { p { color: #94a3b8; } }
    a { display: inline-flex; align-items: center; border-radius: 999px; background: #1d4ed8; color: #fff; text-decoration: none; font-weight: 600; padding: 0.65rem 1rem; }
  </style>
</head>
<body>
  <main>
    <h1>This share link expired on this server</h1>
    <p>Open it from your workspace. Serverless instances do not keep generated dashboards unless Blob or KV storage is configured.</p>
    <p style="font-size:12px">id: ${safeId}</p>
    <a href="/">Open workspace</a>
  </main>
</body>
</html>`;
}
