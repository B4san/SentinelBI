import type { Request, Response } from 'express';
import { GenerationTimeoutError } from '../src/lib/ai/openaiCompatible';
import { generateDashboardOnServer } from '../src/lib/dashboard/generate';
import { validateDashboardSpec } from '../src/lib/dashboard/validate';
import { finalizeDashboardSpec } from '../src/lib/dashboard/finalize';
import { loadDashboard, rememberDashboard } from '../src/lib/dashboard/store';
import type { DashboardDataset, DashboardSpec } from '../src/lib/dashboard/types';

function readApiKey(req: Request): string {
  const header = req.headers['x-api-key'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const bodyKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  return String(fromHeader || bodyKey || '').trim();
}

function asDatasets(raw: unknown): DashboardDataset[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    const rec = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      id: String(rec.id || `ds-${i}`),
      name: String(rec.name || `Dataset ${i + 1}`),
      data: Array.isArray(rec.data) ? rec.data as Record<string, unknown>[] : [],
      columns: Array.isArray(rec.columns) ? rec.columns as DashboardDataset['columns'] : undefined,
    };
  });
}

export async function generateDashboardHandler(
  req: Request,
  res: Response,
  render?: (spec: DashboardSpec, datasets: DashboardDataset[]) => Promise<string> | string,
) {
  try {
    const datasets = asDatasets(req.body?.datasets);
    const result = await generateDashboardOnServer({
      title: req.body?.title,
      intent: req.body?.intent || req.body?.instruction,
      instruction: req.body?.instruction,
      datasets,
      existing: req.body?.existing,
      widgetId: req.body?.widgetId,
      archetype: req.body?.archetype,
      mode: req.body?.mode,
      seed: req.body?.seed,
      apiKey: readApiKey(req),
      provider: req.body?.provider,
      baseUrl: req.body?.baseUrl,
      model: req.body?.model,
    }, process.env);
    rememberDashboard(result.spec.id, result.spec, datasets);
    let html: string | undefined;
    if (req.body?.includeHtml && render) {
      html = await render(result.spec, datasets);
    }
    return res.json({
      spec: result.spec,
      source: result.source,
      error: result.error,
      fallbackReason: result.fallbackReason,
      html,
    });
  } catch (error) {
    if (error instanceof GenerationTimeoutError) {
      return res.status(504).json({ error: error.message, fallbackReason: error.message });
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Dashboard generation failed',
    });
  }
}

export async function renderDashboardHandler(
  req: Request,
  res: Response,
  render: (spec: DashboardSpec, datasets: DashboardDataset[]) => Promise<string> | string,
) {
  try {
    const datasets = asDatasets(req.body?.datasets);
    const spec = finalizeDashboardSpec(validateDashboardSpec(req.body?.spec || {}), datasets);
    const html = await render(spec, datasets);
    rememberDashboard(spec.id, spec, datasets);
    return res.json({ spec, html });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Render failed',
    });
  }
}

export function getStoredDashboard(id: string) {
  return loadDashboard(id);
}
