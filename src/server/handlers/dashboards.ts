import type { Request, Response } from 'express';
import { generateDashboardOnServer } from '../../lib/dashboard/generate';
import { validateDashboardSpec } from '../../lib/dashboard/validate';
import { finalizeDashboardSpec } from '../../lib/dashboard/finalize';
import { listStoredDashboardIds, loadDashboard, rememberDashboard } from '../../lib/dashboard/store';
import type { DashboardDataset, DashboardSpec } from '../../lib/dashboard/types';
import { resolveGenerateDeadlineMs } from '../runtime';
import { httpStatusForGenerateResult, readApiKey } from '../http';
import type { LoadRenderer } from '../ssr';

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

type RenderFn = (spec: DashboardSpec, datasets: DashboardDataset[]) => Promise<string> | string;

async function htmlFromRender(
  renderOrLoad: LoadRenderer | RenderFn | undefined,
  spec: DashboardSpec,
  datasets: DashboardDataset[],
): Promise<string | undefined> {
  if (!renderOrLoad) return undefined;
  if (renderOrLoad.length >= 2) {
    return (renderOrLoad as RenderFn)(spec, datasets);
  }
  const maybe = await Promise.resolve((renderOrLoad as LoadRenderer)());
  if (typeof maybe === 'string') return maybe;
  if (maybe && typeof maybe === 'object' && 'renderDashboard' in maybe) {
    return maybe.renderDashboard(spec, datasets);
  }
  return undefined;
}

export async function generateDashboardHandler(
  req: Request,
  res: Response,
  renderOrLoad?: LoadRenderer | RenderFn,
) {
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
    deadlineMs: resolveGenerateDeadlineMs(process.env),
  }, process.env);
  await rememberDashboard(result.spec.id, result.spec, datasets);
  let html: string | undefined;
  if (req.body?.includeHtml) {
    html = await htmlFromRender(renderOrLoad, result.spec, datasets);
  }
  const status = httpStatusForGenerateResult(result);
  return res.status(status).json({
    spec: result.spec,
    source: result.source,
    error: result.error,
    fallbackReason: result.fallbackReason,
    attempts: result.attempts,
    html,
  });
}

export async function renderDashboardHandler(
  req: Request,
  res: Response,
  loadRenderer: LoadRenderer,
) {
  const datasets = asDatasets(req.body?.datasets);
  const spec = finalizeDashboardSpec(validateDashboardSpec(req.body?.spec || {}), datasets);
  const { renderDashboard } = await loadRenderer();
  const html = await renderDashboard(spec, datasets);
  return res.json({ spec, html });
}

export async function listDashboardsHandler(_req: Request, res: Response) {
  return res.json({ dashboards: listStoredDashboardIds() });
}

export async function getStoredDashboard(id: string) {
  return loadDashboard(id);
}

export type { LoadRenderer };
