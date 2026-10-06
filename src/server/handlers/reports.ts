import type { Request, Response } from 'express';
import { generateExecutiveReportOnServer } from '../../lib/report/generate';
import type { DashboardDataset } from '../../lib/dashboard/types';
import { resolveGenerateDeadlineMs } from '../runtime';
import { httpStatusForGenerateResult, readApiKey } from '../http';

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

export async function generateReportHandler(req: Request, res: Response) {
  const datasets = asDatasets(req.body?.datasets);
  const result = await generateExecutiveReportOnServer({
    title: String(req.body?.title || 'Workspace'),
    intent: String(req.body?.intent || ''),
    datasets,
    chatContext: String(req.body?.chatContext || ''),
    policies: req.body?.policies,
    apiKey: readApiKey(req),
    provider: req.body?.provider,
    model: req.body?.model,
    baseUrl: req.body?.baseUrl,
    deadlineMs: resolveGenerateDeadlineMs(process.env),
  });
  console.info(JSON.stringify({
    evt: 'report.generate.http',
    route: '/api/reports/generate',
    source: result.source,
    fallbackReason: result.fallbackReason,
    error: result.error,
    attempts: result.attempts,
  }));
  const status = httpStatusForGenerateResult({
    spec: {} as never,
    source: result.source,
    fallbackReason: result.fallbackReason,
    error: result.error,
    attempts: result.attempts,
  });
  return res.status(status).json(result);
}
