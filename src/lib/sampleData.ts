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

export const SAMPLE_WEB_ROWS = [
  { date: daysAgo(27), channel: 'Organic', device: 'Desktop', landing: '/pricing', sessions: 1840, bounce: 0.41, conversions: 62, revenue: 18600 },
  { date: daysAgo(24), channel: 'Paid', device: 'Mobile', landing: '/home', sessions: 2620, bounce: 0.58, conversions: 41, revenue: 9840 },
  { date: daysAgo(21), channel: 'Email', device: 'Desktop', landing: '/docs', sessions: 980, bounce: 0.29, conversions: 54, revenue: 12150 },
  { date: daysAgo(18), channel: 'Organic', device: 'Mobile', landing: '/home', sessions: 2210, bounce: 0.47, conversions: 38, revenue: 7600 },
  { date: daysAgo(15), channel: 'Referral', device: 'Desktop', landing: '/pricing', sessions: 740, bounce: 0.22, conversions: 71, revenue: 24850 },
  { date: daysAgo(12), channel: 'Paid', device: 'Desktop', landing: '/pricing', sessions: 1680, bounce: 0.51, conversions: 29, revenue: 8700 },
  { date: daysAgo(9), channel: 'Organic', device: 'Desktop', landing: '/docs', sessions: 1430, bounce: 0.33, conversions: 47, revenue: 9400 },
  { date: daysAgo(6), channel: 'Email', device: 'Mobile', landing: '/home', sessions: 890, bounce: 0.36, conversions: 33, revenue: 5610 },
  { date: daysAgo(3), channel: 'Referral', device: 'Mobile', landing: '/blog', sessions: 610, bounce: 0.44, conversions: 18, revenue: 3240 },
  { date: daysAgo(1), channel: 'Paid', device: 'Desktop', landing: '/home', sessions: 1980, bounce: 0.55, conversions: 36, revenue: 7920 },
];

export const SAMPLE_HR_ROWS = [
  { month: daysAgo(270), department: 'Engineering', location: 'Austin', headcount: 86, hires: 8, attrition: 0.04, offers: 12, acceptRate: 0.67 },
  { month: daysAgo(240), department: 'Sales', location: 'New York', headcount: 41, hires: 5, attrition: 0.09, offers: 9, acceptRate: 0.55 },
  { month: daysAgo(210), department: 'Engineering', location: 'Remote', headcount: 94, hires: 11, attrition: 0.03, offers: 14, acceptRate: 0.79 },
  { month: daysAgo(180), department: 'People', location: 'Austin', headcount: 18, hires: 2, attrition: 0.06, offers: 3, acceptRate: 0.67 },
  { month: daysAgo(150), department: 'Sales', location: 'London', headcount: 27, hires: 4, attrition: 0.11, offers: 8, acceptRate: 0.50 },
  { month: daysAgo(120), department: 'Engineering', location: 'Austin', headcount: 101, hires: 9, attrition: 0.05, offers: 11, acceptRate: 0.82 },
  { month: daysAgo(90), department: 'Design', location: 'Remote', headcount: 16, hires: 3, attrition: 0.06, offers: 4, acceptRate: 0.75 },
  { month: daysAgo(60), department: 'Sales', location: 'New York', headcount: 44, hires: 6, attrition: 0.08, offers: 10, acceptRate: 0.60 },
  { month: daysAgo(30), department: 'Engineering', location: 'Remote', headcount: 108, hires: 7, attrition: 0.02, offers: 9, acceptRate: 0.78 },
  { month: daysAgo(5), department: 'People', location: 'London', headcount: 21, hires: 3, attrition: 0.05, offers: 4, acceptRate: 0.75 },
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
    description: 'Inspect regional revenue mix and channel contribution.',
    prompt: 'Build a board that makes regional revenue and channel mix obvious.',
    summary: 'Sample commercial dataset covering regions, products, and channel revenue.',
  },
  support: {
    rows: SAMPLE_SUPPORT_ROWS,
    title: 'Care Queue',
    description: 'See which queues consume hours and where CSAT slips.',
    prompt: 'Show queue pressure, CSAT, and where to staff next.',
    summary: 'Sample support dataset covering queues, agents, hours, and CSAT.',
  },
  web: {
    rows: SAMPLE_WEB_ROWS,
    title: 'Atlas Web Analytics',
    description: 'Acquisition mix, bounce, and conversion quality.',
    prompt: 'Show which channels convert and where bounce is wasting sessions.',
    summary: 'Sample web analytics covering channel, device, sessions, bounce, and conversions.',
  },
  hr: {
    rows: SAMPLE_HR_ROWS,
    title: 'People Pulse',
    description: 'Headcount, hiring, and attrition by department.',
    prompt: 'Compare hiring health and attrition across departments and locations.',
    summary: 'Sample HR dataset covering headcount, hires, attrition, and offer acceptance.',
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
