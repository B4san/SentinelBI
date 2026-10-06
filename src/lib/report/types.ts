import type { GenerateAttempt } from '../dashboard/generate';

export interface ReportKpi {
  label: string;
  value: string;
  raw: number;
  context: string;
}

export interface ReportRank {
  dimension: string;
  key: string;
  value: string;
  sharePct: number;
}

export interface ReportFacts {
  title: string;
  rowCount: number;
  columnCount: number;
  completeness: number;
  anomalies: number;
  kpis: ReportKpi[];
  ranks: ReportRank[];
  trend?: { measure: string; deltaPct: number; direction: 'up' | 'down' | 'flat' };
  outliers: { field: string; count: number }[];
  findings: string[];
  methodology: string;
  tokens: string[];
}

export interface ExecutiveReportDoc {
  title: string;
  executiveSummary: string;
  keyFindings: string[];
  trends: string;
  risks: string;
  recommendations: string[];
  methodology: string;
  markdown: string;
  source: 'ai' | 'fallback';
  fallbackReason?: string;
  error?: string;
  generatedBy?: string;
  generatedAt: string;
  facts: ReportFacts;
  attempts?: GenerateAttempt[];
}

export interface GenerateReportContext {
  title?: string;
  intent?: string;
  datasets: import('../dashboard/types').DashboardDataset[];
  chatContext?: string;
  policies?: { writerGuidelines?: string; forbiddenActions?: string };
  apiKey?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  deadlineMs?: number;
}
