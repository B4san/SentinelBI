import { computeSpaceDataTruth, type DataStats } from '../DataTruthEngine';
import { classifyFields, prettyField } from '../dashboard/insights';
import { computeDerivedValue, inferAggregation, proposeDerivedMeasures } from '../dashboard/measures';
import { formatMetric } from '../dashboard/format';
import { metricFormat } from '../dashboard/insights';
import { sparklineValues } from '../dashboard/insights';
import { toDashboardDatasets } from '../sampleData';
import type { Space } from '../../store';
import type { ProviderConfig } from '../ai/types';
import type { TopologyHealth } from '../topology/buildTopology';
import type { GenerateAttempt } from '../dashboard/generate';

export interface OverviewKpi {
  id: string;
  label: string;
  value: string;
  raw: number;
  context: string;
  change?: string;
  sparkline: number[];
}

export interface ColumnHealth {
  name: string;
  type: string;
  completeness: number;
  nulls: number;
  outliers: number;
}

export interface ActivityItem {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: 'ok' | 'warn' | 'info';
}

export interface OverviewModel {
  hasData: boolean;
  rowCount: number;
  columnCount: number;
  completeness: number | null;
  anomalies: number;
  kpis: OverviewKpi[];
  columns: ColumnHealth[];
  activity: ActivityItem[];
  latestDashboard?: {
    id: string;
    title: string;
    widgets: number;
    archetype?: string;
    generatedBy?: string;
    createdAt: string;
  };
  providerLabel: string;
  keySource: 'user' | 'env' | 'none';
}

function datasetList(space: Space) {
  if (space.datasets && space.datasets.length > 0) return space.datasets;
  if (space.parsedData?.length) {
    return [{ id: 'legacy', name: 'Primary dataset', data: space.parsedData, columns: space.columns || [] }];
  }
  return [];
}

function columnHealth(stats: DataStats, columns: { name: string; type?: string }[], rows: Record<string, unknown>[]): ColumnHealth[] {
  const names = columns.length ? columns.map((c) => c.name) : Object.keys(rows[0] || {});
  const total = stats.rowCount || rows.length;
  return names.slice(0, 12).map((name) => {
    let nulls = 0;
    rows.forEach((row) => {
      const v = row[name];
      if (v == null || v === '') nulls += 1;
    });
    const type = columns.find((c) => c.name === name)?.type
      || (stats.numericSummary[name] ? 'numeric' : stats.dateSummary[name] ? 'date' : 'categorical');
    return {
      name,
      type,
      completeness: total > 0 ? Math.round(((total - nulls) / total) * 100) : 0,
      nulls,
      outliers: stats.outlierSummary[name] || 0,
    };
  });
}

export function buildOverviewModel(
  space: Space,
  aiSettings?: ProviderConfig | null,
  health?: TopologyHealth | null,
): OverviewModel {
  const datasets = datasetList(space);
  const dashDatasets = toDashboardDatasets(space);
  const truth = computeSpaceDataTruth(datasets);
  const hasData = truth.totalRowCount > 0;
  const completeness = hasData ? truth.overallCompletenessScore : null;

  const kpis: OverviewKpi[] = [];
  if (hasData) {
    kpis.push({
      id: 'rows',
      label: 'Rows loaded',
      value: truth.totalRowCount.toLocaleString(),
      raw: truth.totalRowCount,
      context: `${datasets.length} dataset${datasets.length === 1 ? '' : 's'}`,
      sparkline: [],
    });
    kpis.push({
      id: 'completeness',
      label: 'Completeness',
      value: `${completeness}%`,
      raw: completeness || 0,
      context: 'Non-null cells across datasets',
      sparkline: [],
    });
    kpis.push({
      id: 'anomalies',
      label: 'Anomaly flags',
      value: String(truth.totalAnomalyCount),
      raw: truth.totalAnomalyCount,
      context: truth.totalAnomalyCount === 0 ? 'No column null-rate flags' : 'Columns with >20% nulls',
      sparkline: [],
    });
  }

  const primary = dashDatasets[0];
  if (primary && (primary.data || []).length > 0) {
    const fields = classifyFields(primary);
    const derived = proposeDerivedMeasures(primary).slice(0, 2);
    derived.forEach((item) => {
      if (!item.measure) return;
      const raw = computeDerivedValue(primary.data, item.measure);
      kpis.push({
        id: item.id,
        label: item.title,
        value: formatMetric(raw, item.format || item.measure.format),
        raw,
        context: 'Derived from uploaded columns',
        sparkline: [],
      });
    });
    fields.measures.slice(0, Math.max(0, 6 - kpis.length)).forEach((field) => {
      const format = metricFormat(field);
      const agg = inferAggregation(field, format);
      const values = primary.data.map((row) => Number(row[field])).filter((n) => Number.isFinite(n));
      const raw = agg === 'avg'
        ? values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
        : agg === 'count'
          ? values.length
          : values.reduce((a, b) => a + b, 0);
      kpis.push({
        id: `m-${field}`,
        label: prettyField(field),
        value: formatMetric(raw, format),
        raw,
        context: `${agg} of ${field}`,
        sparkline: sparklineValues(primary.data, field).slice(-16),
      });
    });
  }

  const columns: ColumnHealth[] = [];
  datasets.forEach((ds) => {
    const stats = truth.datasetsStats[ds.id] || truth.datasetsStats[ds.name];
    if (!stats) return;
    columns.push(...columnHealth(stats, ds.columns || [], ds.data || []));
  });

  const activity: ActivityItem[] = [];
  (space.generationRuns || []).forEach((run, i) => {
    activity.push({
      id: `gen-${i}-${run.at}`,
      at: run.at,
      title: run.source === 'ai' ? `Dashboard generated by ${run.model || 'model'}` : 'Used data-fitted fallback',
      detail: run.fallbackReason || (run.attempts || []).map((a: GenerateAttempt) => `${a.step}${a.ms ? ` ${a.ms}ms` : ''}`).join(' → ') || run.source,
      tone: run.source === 'ai' ? 'ok' : 'warn',
    });
  });
  (space.executionTimeline || []).forEach((item) => {
    activity.push({
      id: item.id,
      at: item.timestamp,
      title: `${item.agent}: ${item.action}`,
      detail: item.details || item.status,
      tone: item.status === 'failed' ? 'warn' : 'info',
    });
  });
  (space.chatMessages || []).slice(-8).forEach((msg) => {
    activity.push({
      id: msg.id,
      at: msg.timestamp,
      title: msg.role === 'user' ? 'Chat prompt' : (msg.agentName || 'Agent reply'),
      detail: String(msg.content || '').slice(0, 160),
      tone: 'info',
    });
  });
  activity.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const saved = space.savedDashboards?.[0];
  const latestDashboard = saved
    ? {
        id: saved.id,
        title: saved.name || saved.spec.title,
        widgets: saved.spec.widgets?.length || 0,
        archetype: saved.spec.archetype,
        generatedBy: saved.spec.generatedBy,
        createdAt: saved.createdAt,
      }
    : space.dashboardSpec
      ? {
          id: space.dashboardSpec.id,
          title: space.dashboardSpec.title,
          widgets: space.dashboardSpec.widgets.length,
          archetype: space.dashboardSpec.archetype,
          generatedBy: space.dashboardSpec.generatedBy,
          createdAt: space.updatedAt,
        }
      : undefined;

  const keySource: 'user' | 'env' | 'none' = aiSettings?.apiKey ? 'user' : health?.hasServerKey ? 'env' : 'none';
  const providerLabel = `${aiSettings?.provider || health?.provider || 'unconfigured'} · ${aiSettings?.model || health?.model || '—'}`;

  return {
    hasData,
    rowCount: truth.totalRowCount,
    columnCount: truth.totalColumnCount,
    completeness,
    anomalies: truth.totalAnomalyCount,
    kpis: kpis.slice(0, 6),
    columns: columns.slice(0, 10),
    activity: activity.slice(0, 12),
    latestDashboard,
    providerLabel,
    keySource,
  };
}
