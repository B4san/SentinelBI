import type { Space } from '../store';
import type { DashboardDataset } from './dashboard/types';
import financeCsv from './sample-data/finance';
import hrCsv from './sample-data/hr';
import salesCsv from './sample-data/sales';
import supportCsv from './sample-data/support';
import webCsv from './sample-data/web';

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const rec: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const raw = cols[i] ?? '';
      const n = Number(raw);
      rec[h] = raw !== '' && !Number.isNaN(n) && /^-?\d/.test(raw) ? n : raw;
    });
    return rec;
  });
}

export const SAMPLE_SALES_ROWS = parseCsv(salesCsv);
export const SAMPLE_WEB_ROWS = parseCsv(webCsv);
export const SAMPLE_FINANCE_ROWS = parseCsv(financeCsv);
export const SAMPLE_HR_ROWS = parseCsv(hrCsv);
export const SAMPLE_SUPPORT_ROWS = parseCsv(supportCsv);

function columnsFrom(rows: Record<string, unknown>[]) {
  const sample = rows[0] || {};
  return Object.keys(sample).map((name) => ({
    name,
    type: typeof sample[name] === 'number' ? 'numeric' as const : /date|opened|month/i.test(name) ? 'date' as const : 'categorical' as const,
  }));
}

export function toDashboardDatasets(space: { datasets?: Array<{ id: string; name: string; data: any[]; columns?: any[] }>; parsedData?: any[]; columns?: any[] }): DashboardDataset[] {
  if (space.datasets && space.datasets.length > 0) {
    return space.datasets.map((d) => ({
      id: d.id,
      name: d.name,
      data: d.data || [],
      columns: d.columns || [],
    }));
  }
  if (space.parsedData && space.parsedData.length > 0) {
    return [{
      id: 'legacy',
      name: 'Primary dataset',
      data: space.parsedData,
      columns: space.columns || [],
    }];
  }
  return [];
}

const SAMPLE_KIND: Record<string, { rows: Record<string, unknown>[]; title: string; description: string; prompt: string; summary: string }> = {
  sales: {
    rows: SAMPLE_SALES_ROWS,
    title: 'Northstar Revenue',
    description: 'Regional revenue, channel mix, and product margin over 12 months.',
    prompt: 'Build a board that makes regional revenue, discount pressure, and channel mix obvious.',
    summary: '640 sales orders across 12 months, 5 regions, 3 channels, 4 products.',
  },
  web: {
    rows: SAMPLE_WEB_ROWS,
    title: 'Atlas Web Analytics',
    description: 'Daily acquisition, bounce, conversion, and spend over 12 weeks.',
    prompt: 'Show which channels convert and where bounce and paid spend waste sessions.',
    summary: '504 daily channel rows over 12 weeks with sessions, bounce, conversions, and ad spend.',
  },
  finance: {
    rows: SAMPLE_FINANCE_ROWS,
    title: 'Finance Operations',
    description: 'Revenue, COGS, opex vs budget, and EBITDA by business unit.',
    prompt: 'Compare opex vs budget and EBITDA margin across business units for 24 months.',
    summary: '288 monthly finance rows across 4 units and 3 cost centers.',
  },
  support: {
    rows: SAMPLE_SUPPORT_ROWS,
    title: 'Care Queue',
    description: 'Queue pressure, hours, and CSAT.',
    prompt: 'Show queue pressure, CSAT, and where to staff next.',
    summary: '210 support tickets across queues, agents, hours, and CSAT.',
  },
  hr: {
    rows: SAMPLE_HR_ROWS,
    title: 'People Pulse',
    description: 'Headcount, hiring, and attrition by department.',
    prompt: 'Compare hiring health and attrition across departments and locations.',
    summary: '180 monthly HR rows covering headcount, hires, and attrition.',
  },
};

export type SampleKind = keyof typeof SAMPLE_KIND;

export function createSampleSpace(kind: SampleKind = 'sales'): Space {
  const meta = SAMPLE_KIND[kind] || SAMPLE_KIND.sales;
  const rows = meta.rows;
  const columns = columnsFrom(rows);
  const title = meta.title;
  const now = new Date().toISOString();
  return {
    id: `sp-sample-${kind}-${Date.now()}`,
    title,
    description: meta.description,
    createdAt: now,
    updatedAt: now,
    isFavorite: true,
    uploadedFiles: [{ id: `f-${kind}`, name: `${kind}.csv`, size: rows.length * 80, type: 'text/csv' }],
    parsedData: rows,
    columns,
    datasets: [{
      id: `ds-${kind}`,
      name: `${title}.csv`,
      type: 'text/csv',
      data: rows,
      columns,
      semanticRole: 'fact',
      refreshStatus: 'success',
      versionNumber: 1,
      lastSyncTimestamp: now,
      relationshipCandidates: [],
      embeddingsRecomputed: true,
      qualityScore: 96,
    }],
    promptContext: meta.prompt,
    executionState: 'idle',
    generatedCode: '',
    executionTimeline: [],
    aiSummary: meta.summary,
    governanceLogs: [],
    securityEvents: [],
    chatMessages: [],
    topologyNodes: [],
    topologyEdges: [],
    visualInsights: [],
    savedDashboards: [],
  };
}
