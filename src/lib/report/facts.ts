import { computeDataTruth } from '../DataTruthEngine';
import { classifyFields, prettyField, rankedGroups, periodChange, analyzeDataset } from '../dashboard/insights';
import { computeDerivedValue, formatDerived, proposeDerivedMeasures } from '../dashboard/measures';
import { formatMetric } from '../dashboard/format';
import type { DashboardDataset } from '../dashboard/types';
import type { ReportFacts, ReportKpi, ReportRank } from './types';

export function buildReportFacts(title: string, datasets: DashboardDataset[]): ReportFacts {
  const rows = datasets.flatMap((d) => d.data || []);
  const truth = computeDataTruth(rows);
  const dataset = datasets[0];
  const fields = dataset ? classifyFields(dataset) : { measures: [] as string[], dimensions: [] as string[], time: [] as string[] };
  const kpis: ReportKpi[] = [];
  const ranks: ReportRank[] = [];
  const tokens: string[] = [
    String(truth.rowCount),
    `${truth.completenessScore}%`,
    String(truth.anomalyCount),
  ];

  kpis.push({
    label: 'Rows analysed',
    value: truth.rowCount.toLocaleString(),
    raw: truth.rowCount,
    context: `${datasets.length} dataset${datasets.length === 1 ? '' : 's'}`,
  });
  kpis.push({
    label: 'Completeness',
    value: `${truth.completenessScore}%`,
    raw: truth.completenessScore,
    context: `${truth.nullCount} empty cells of ${(truth.rowCount * truth.columnCount) || 0}`,
  });
  kpis.push({
    label: 'Anomaly flags',
    value: String(truth.anomalyCount),
    raw: truth.anomalyCount,
    context: 'Null-rate and outlier flags from DataTruthEngine',
  });

  if (dataset) {
    for (const candidate of proposeDerivedMeasures(dataset).slice(0, 4)) {
      const raw = computeDerivedValue(dataset.data || [], candidate.measure);
      if (!Number.isFinite(raw)) continue;
      const value = formatDerived(raw, candidate.measure.format);
      kpis.push({
        label: candidate.title,
        value,
        raw,
        context: `Computed ${candidate.measure.kind} on loaded rows`,
      });
      tokens.push(value);
    }
    const primary = fields.measures.find((n) => /rev|session|amount/i.test(n)) || fields.measures[0];
    if (primary) {
      const sum = (dataset.data || []).reduce((acc, row) => acc + Number(row[primary] || 0), 0);
      const value = formatMetric(sum, /rev|amount|spend|opex/i.test(primary) ? 'currency' : 'number');
      kpis.push({
        label: prettyField(primary),
        value,
        raw: sum,
        context: `Sum of ${prettyField(primary)}`,
      });
      tokens.push(value);
    }
    for (const dim of fields.dimensions.slice(0, 3)) {
      if (!primary) break;
      const ranked = rankedGroups(dataset.data || [], dim, primary);
      if (!ranked[0]) continue;
      const sharePct = Math.round(ranked[0].share * 100);
      ranks.push({
        dimension: prettyField(dim),
        key: ranked[0].key,
        value: formatMetric(ranked[0].value, /rev|amount|spend/i.test(primary) ? 'currency' : 'number'),
        sharePct,
      });
      tokens.push(`${sharePct}%`, ranked[0].key);
    }
  }

  const outliers = Object.entries(truth.outlierSummary || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([field, count]) => ({ field: prettyField(field), count: Number(count) }));

  let trend: ReportFacts['trend'];
  if (dataset && fields.time[0] && fields.measures[0]) {
    const change = periodChange(dataset.data || [], fields.time[0], fields.measures[0]);
    if (change) {
      const deltaPct = Number(change.deltaPct.toFixed(1));
      trend = {
        measure: prettyField(fields.measures[0]),
        deltaPct,
        direction: deltaPct > 0.4 ? 'up' : deltaPct < -0.4 ? 'down' : 'flat',
      };
      tokens.push(`${deltaPct}%`);
    }
  }

  const findings = dataset ? analyzeDataset(dataset).slice(0, 6).map((f) => f.text || f.title) : [];

  const methodology = [
    `Figures are computed on ${truth.rowCount} loaded rows × ${truth.columnCount} columns.`,
    'Completeness is 1 − (empty cells / total cells). Anomalies are nulls plus numeric outliers from DataTruthEngine.',
    'Derived ratios (margin, AOV, rates) use the same measure engine as generated dashboards.',
    'The model is instructed not to invent numbers; any AI draft is checked against this fact list. If the check fails or the provider errors, a labelled template is used instead.',
  ].join(' ');

  return {
    title,
    rowCount: truth.rowCount,
    columnCount: truth.columnCount,
    completeness: truth.completenessScore,
    anomalies: truth.anomalyCount,
    kpis: kpis.slice(0, 8),
    ranks,
    trend,
    outliers,
    findings,
    methodology,
    tokens: [...new Set(tokens.filter(Boolean))],
  };
}
