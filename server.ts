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
    await generateDashboardHandler(req, res);
    if (!res.headersSent) return;
    if (req.body?.includeHtml && res.statusCode === 200) {
      // body already sent as JSON without html; clients that need HTML use /render
    }
  });

  app.post('/api/dashboards/render', async (req, res) => {
    const { renderDashboard } = await loadRenderer();
    return renderDashboardHandler(req, res, renderDashboard);
  });

  app.get('/d/:id', async (req, res) => {
    try {
      const { renderDashboardDocument } = await loadRenderer();
      const stored = getStoredDashboard(req.params.id);
      if (stored) {
        const html = renderDashboardDocument(stored.spec, stored.datasets, prodAssets());
        return res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      }
      const sample = sampleFromId(req.params.id);
      if (sample) {
        const html = renderDashboardDocument(sample.spec, sample.datasets, prodAssets());
        return res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      }
      return res.status(404).json({ error: 'Dashboard not found' });
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
  const match = id.match(/^sample-([a-z]+)-([a-z-]+)(?:-(light|dark))?$/);
  if (id === 'mocked-ai') {
    const space = createSampleSpace('sales');
    const datasets = toDashboardDatasets(space);
    return { spec: finalizeDashboardSpec(mockedAiSpec(datasets), datasets), datasets };
  }
  if (!match) return null;
  const kind = match[1] as SampleKind;
  const archetype = match[2] as LayoutArchetype;
  const mode = (match[3] || 'light') as 'light' | 'dark';
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
  if (process.env.NODE_ENV !== 'production') return undefined;
  try {
    const html = fs.readFileSync(path.join(process.cwd(), 'dist/index.html'), 'utf8');
    const css = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
    return { css, js: ['/src/entry-client-dashboard.tsx'] };
  } catch {
    return undefined;
  }
}

startServer();
