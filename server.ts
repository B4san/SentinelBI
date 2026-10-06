import { config as loadEnv } from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import geminiHandler from './api/gemini';
import { aiGenerateHandler, aiModelsHandler, aiProvidersHandler } from './api/ai';
import { generateDashboardHandler, getStoredDashboard, renderDashboardHandler } from './api/dashboards';
import { buildFallbackDashboard } from './src/lib/dashboard/fallback';
import { mockedAiSpec } from './src/lib/dashboard/mockedAiSpec';
import { createSampleSpace, toDashboardDatasets, type SampleKind } from './src/lib/sampleData';
import { finalizeDashboardSpec } from './src/lib/dashboard/finalize';
import type { LayoutArchetype } from './src/lib/dashboard/types';

loadEnv({ path: '.env.local' });
loadEnv();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '8mb' }));

  app.post('/api/gemini', geminiHandler);
  app.post('/api/ai', aiGenerateHandler);
  app.get('/api/ai/models', aiModelsHandler);
  app.get('/api/ai/providers', aiProvidersHandler);

  let vite: ViteDevServer | undefined;
  if (!isProd) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
  }

  async function loadRenderer() {
    if (vite) {
      return vite.ssrLoadModule('/src/entry-server.tsx') as Promise<typeof import('./src/entry-server')>;
    }
    return import(path.join(process.cwd(), 'dist/ssr/entry-server.js'));
  }

  app.post('/api/dashboards/generate', async (req, res) => {
    const { renderDashboard } = await loadRenderer();
    return generateDashboardHandler(req, res, renderDashboard);
  });

  app.post('/api/dashboards/render', async (req, res) => {
    const { renderDashboard } = await loadRenderer();
    return renderDashboardHandler(req, res, renderDashboard);
  });

  app.get('/d/:id', async (req, res) => {
    try {
      const { renderDashboardDocument } = await loadRenderer();
      const stored = getStoredDashboard(req.params.id);
      const payload = stored || sampleFromId(req.params.id);
      if (!payload) return res.status(404).json({ error: 'Dashboard not found' });
      const assets = isProd ? prodAssets() : { js: ['/src/entry-client-dashboard.tsx'] };
      let html = renderDashboardDocument(payload.spec, payload.datasets, assets);
      if (vite) {
        html = await vite.transformIndexHtml(req.originalUrl, html);
      }
      return res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'SSR failed' });
    }
  });

  if (!isProd && vite) {
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

function sampleFromId(id: string) {
  if (id === 'mocked-ai') {
    const space = createSampleSpace('sales');
    const datasets = toDashboardDatasets(space);
    return { spec: finalizeDashboardSpec(mockedAiSpec(datasets), datasets), datasets };
  }
  const mode = /-(dark)$/.test(id) ? 'dark' as const : /-(light)$/.test(id) ? 'light' as const : 'light' as const;
  const rest = id.replace(/-(light|dark)$/, '');
  const match = rest.match(/^sample-([a-z]+)-([a-z-]+)$/);
  if (!match) return null;
  const kind = match[1] as SampleKind;
  const archetype = match[2] as LayoutArchetype;
  const space = createSampleSpace(kind);
  const datasets = toDashboardDatasets(space);
  const spec = buildFallbackDashboard({
    title: space.title,
    intent: space.promptContext,
    datasets,
    seed: 17,
    archetype,
    mode,
  });
  return { spec, datasets };
}

function prodAssets(): { css?: string[]; js?: string[] } | undefined {
  try {
    const manifestPath = path.join(process.cwd(), 'dist/.vite/manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, { file: string; css?: string[]; imports?: string[] }>;
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

startServer();
