import type { Space } from '../store';
import type { DashboardDataset } from './dashboard/types';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const SAMPLE_SALES_ROWS = [
  { date: daysAgo(28), region: 'North', channel: 'Direct', product: 'Atlas CRM', revenue: 48200, units: 38, margin: 0.41 },
  { date: daysAgo(24), region: 'North', channel: 'Partner', product: 'Helios ERP', revenue: 61500, units: 12, margin: 0.33 },
  { date: daysAgo(21), region: 'South', channel: 'Direct', product: 'Atlas CRM', revenue: 22100, units: 19, margin: 0.38 },
  { date: daysAgo(18), region: 'EMEA', channel: 'Web', product: 'Nimbus Analytics', revenue: 33800, units: 27, margin: 0.52 },
  { date: daysAgo(15), region: 'APAC', channel: 'Partner', product: 'Helios ERP', revenue: 75400, units: 9, margin: 0.29 },
  { date: daysAgo(12), region: 'South', channel: 'Web', product: 'Nimbus Analytics', revenue: 18750, units: 41, margin: 0.48 },
  { date: daysAgo(9), region: 'North', channel: 'Direct', product: 'Nimbus Analytics', revenue: 29400, units: 22, margin: 0.55 },
  { date: daysAgo(6), region: 'EMEA', channel: 'Direct', product: 'Atlas CRM', revenue: 41200, units: 31, margin: 0.44 },
  { date: daysAgo(3), region: 'APAC', channel: 'Web', product: 'Atlas CRM', revenue: 16800, units: 14, margin: 0.36 },
  { date: daysAgo(1), region: 'South', channel: 'Partner', product: 'Helios ERP', revenue: 53900, units: 8, margin: 0.31 },
];

export const SAMPLE_SUPPORT_ROWS = [
  { opened: daysAgo(20), queue: 'Billing', priority: 'High', agent: 'Imani', hours: 6.5, csat: 4.2, tickets: 18 },
  { opened: daysAgo(17), queue: 'Onboarding', priority: 'Medium', agent: 'Noah', hours: 12.1, csat: 4.7, tickets: 26 },
  { opened: daysAgo(14), queue: 'Incidents', priority: 'Critical', agent: 'Sofia', hours: 3.4, csat: 3.8, tickets: 9 },
  { opened: daysAgo(11), queue: 'Billing', priority: 'Low', agent: 'Noah', hours: 8.0, csat: 4.5, tickets: 21 },
  { opened: daysAgo(8), queue: 'Onboarding', priority: 'High', agent: 'Imani', hours: 9.2, csat: 4.1, tickets: 15 },
  { opened: daysAgo(5), queue: 'Incidents', priority: 'High', agent: 'Sofia', hours: 4.8, csat: 4.0, tickets: 11 },
  { opened: daysAgo(2), queue: 'Billing', priority: 'Medium', agent: 'Sofia', hours: 7.3, csat: 4.6, tickets: 17 },
];

function columnsFrom(rows: Record<string, unknown>[]) {
  const sample = rows[0] || {};
  return Object.keys(sample).map((name) => ({
    name,
    type: typeof sample[name] === 'number' ? 'numeric' as const : /date|opened/i.test(name) ? 'date' as const : 'categorical' as const,
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

export function createSampleSpace(kind: 'sales' | 'support' = 'sales'): Space {
  const rows = kind === 'sales' ? SAMPLE_SALES_ROWS : SAMPLE_SUPPORT_ROWS;
  const columns = columnsFrom(rows);
  const title = kind === 'sales' ? 'Northstar Revenue' : 'Care Queue';
  const now = new Date().toISOString();
  return {
    id: `sp-sample-${kind}-${Date.now()}`,
    title,
    description: kind === 'sales'
      ? 'Inspect regional revenue mix and channel contribution.'
      : 'See which queues consume hours and where CSAT slips.',
    createdAt: now,
    updatedAt: now,
    isFavorite: true,
    uploadedFiles: [{ id: `f-${kind}`, name: `${kind}.csv`, size: 2048, type: 'text/csv' }],
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
    promptContext: kind === 'sales'
      ? 'Build a board that makes regional revenue and channel mix obvious.'
      : 'Show queue pressure, CSAT, and where to staff next.',
    executionState: 'idle',
    generatedCode: '',
    executionTimeline: [],
    aiSummary: kind === 'sales'
      ? 'Sample commercial dataset covering regions, products, and channel revenue.'
      : 'Sample support dataset covering queues, agents, hours, and CSAT.',
    governanceLogs: [],
    securityEvents: [],
    chatMessages: [],
    topologyNodes: [],
    topologyEdges: [],
    visualInsights: [],
    savedDashboards: [],
  };
}
