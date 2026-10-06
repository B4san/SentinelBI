import express, { type Express, type Request, type Response } from 'express';
import { buildFallbackDashboard } from '../lib/dashboard/fallback';
import { mockedAiSpec } from '../lib/dashboard/mockedAiSpec';
import { pickPaletteForMode } from '../lib/dashboard/palettes';
import { EXAMPLE_SPECS } from '../lib/dashboard/prompt';
import { createSampleSpace, toDashboardDatasets, type SampleKind } from '../lib/sampleData';
import { finalizeDashboardSpec } from '../lib/dashboard/finalize';
import type { DashboardSpec, LayoutArchetype } from '../lib/dashboard/types';
import { validateDashboardSpec } from '../lib/dashboard/validate';
import { aiGenerateHandler, aiModelsHandler, aiProvidersHandler } from './handlers/ai';
import { geminiHandler } from './handlers/gemini';
import { generateDashboardHandler, getStoredDashboard, listDashboardsHandler, renderDashboardHandler } from './handlers/dashboards';
import { healthHandler } from './handlers/health';
import { generateReportHandler } from './handlers/reports';
import { asyncRoute, sendMappedError } from './http';
import { prodAssets, shareExpiredHtml, type LoadRenderer } from './ssr';

export interface CreateAppOptions {
  loadRenderer?: LoadRenderer;
  assets?: () => ReturnType<typeof prodAssets>;
}

export function sampleFromId(id: string) {
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
  const spec = specFromSampleKind(kind, archetype, mode, space.title, space.promptContext, datasets);
  return { spec, datasets };
}

function specFromSampleKind(
  kind: SampleKind,
  archetype: LayoutArchetype,
  mode: 'light' | 'dark',
  title: string,
  intent: string,
  datasets: ReturnType<typeof toDashboardDatasets>,
): DashboardSpec {
  const exampleKey = kind === 'sales' || kind === 'web' || kind === 'finance' ? kind : null;
  if (!exampleKey) {
    return buildFallbackDashboard({ title, intent, datasets, seed: 17, archetype, mode });
  }
  const palette = pickPaletteForMode(mode === 'dark' ? 'midnight' : 'ocean', mode);
  const validated = validateDashboardSpec({
    ...(EXAMPLE_SPECS[exampleKey] as object),
    title,
    intent,
    archetype: (EXAMPLE_SPECS[exampleKey] as { archetype?: string }).archetype || archetype,
    theme: {
      palette: { ...palette, mode, background: 'transparent' },
      fontFamily: 'font-sans',
      headingFont: 'font-grotesk',
      radius: 'rounded-2xl',
      density: 'comfortable',
    },
  });
  return finalizeDashboardSpec(validated, datasets, { keepCuts: true });
}

export function createApp(opts: CreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));

  const loadRenderer: LoadRenderer = opts.loadRenderer || (async () => {
    const { loadProductionRenderer } = await import('./ssr');
    return loadProductionRenderer();
  });
  const assets = opts.assets || prodAssets;

  app.get('/api/health', asyncRoute(healthHandler));
  app.post('/api/gemini', asyncRoute(geminiHandler));
  app.get('/api/gemini', asyncRoute(async (_req, res) => {
    res.json({ ok: true, provider: 'gemini' });
  }));
  app.post('/api/ai', asyncRoute(aiGenerateHandler));
  app.get('/api/ai', asyncRoute(async (_req, res) => {
    res.json({ ok: true, error: 'Use POST /api/ai with contents or messages.' });
  }));
  app.get('/api/ai/models', asyncRoute(aiModelsHandler));
  app.get('/api/ai/providers', asyncRoute(aiProvidersHandler));
  app.get('/api/dashboards', asyncRoute(listDashboardsHandler));
  app.post('/api/dashboards/generate', asyncRoute(async (req, res) => generateDashboardHandler(req, res, loadRenderer)));
  app.post('/api/dashboards/render', asyncRoute(async (req, res) => renderDashboardHandler(req, res, loadRenderer)));
  app.post('/api/reports/generate', asyncRoute(generateReportHandler));

  app.get('/d/:id', asyncRoute(async (req: Request, res: Response) => {
    const stored = await getStoredDashboard(req.params.id);
    const payload = stored || sampleFromId(req.params.id);
    if (!payload) {
      return res.status(404).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(shareExpiredHtml(req.params.id));
    }
    try {
      const { renderDashboardDocument } = await loadRenderer();
      const html = await renderDashboardDocument(payload.spec, payload.datasets, assets());
      return res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'SSR failed',
      });
    }
  }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `No API route for ${req.method} ${req.path}` });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: () => void) => {
    sendMappedError(res, error);
  });

  return app;
}
