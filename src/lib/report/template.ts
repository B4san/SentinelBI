import type { ExecutiveReportDoc, ReportFacts } from './types';

export function factsToMarkdown(facts: ReportFacts, doc: Omit<ExecutiveReportDoc, 'markdown' | 'facts'>): string {
  const findings = doc.keyFindings.map((line) => `- ${line}`).join('\n');
  const recs = doc.recommendations.map((line, i) => `${i + 1}. ${line}`).join('\n');
  const kpis = facts.kpis.map((k) => `- **${k.label}:** ${k.value} (${k.context})`).join('\n');
  const ranks = facts.ranks.map((r) => `- **${r.dimension}:** ${r.key} at ${r.sharePct}% (${r.value})`).join('\n');
  const banner = doc.source === 'fallback'
    ? `\n> **Template fallback** — ${doc.fallbackReason || 'the model did not return a verified draft.'} Every figure below is computed from loaded rows.\n`
    : '';
  return `# Executive Intelligence Report
${banner}
## 1. Executive Summary
${doc.executiveSummary}

## 2. Key findings
${findings || '_Insufficient data in current scope._'}

### Computed metrics
${kpis || '_No measures in scope._'}

${ranks ? `### Mix\n${ranks}` : ''}

## 3. Trends and drivers
${doc.trends}

## 4. Risks and anomalies
${doc.risks}

## 5. Recommendations
${recs || '_Insufficient data in current scope._'}

## Appendix: Methodology and data note
${doc.methodology}
`;
}

export function buildTemplateReport(facts: ReportFacts, reason: string): Omit<ExecutiveReportDoc, 'markdown' | 'attempts' | 'facts'> {
  const top = facts.ranks[0];
  const kpiLine = facts.kpis.filter((k) => k.label !== 'Rows analysed').slice(0, 4)
    .map((k) => `${k.label} ${k.value}`)
    .join('; ');
  const trendLine = facts.trend
    ? `${facts.trend.measure} moved ${facts.trend.deltaPct > 0 ? '+' : ''}${facts.trend.deltaPct}% period-over-period (${facts.trend.direction}).`
    : 'No dated measure was available to compute a period change.';
  const keyFindings = [
    ...facts.findings.slice(0, 3),
    top ? `${top.key} leads ${top.dimension} at ${top.sharePct}% of the primary measure (${top.value}).` : '',
    facts.anomalies === 0
      ? `Data completeness is ${facts.completeness}% across ${facts.rowCount.toLocaleString()} rows; no anomaly flags.`
      : `${facts.anomalies} anomaly flags on ${facts.rowCount.toLocaleString()} rows (completeness ${facts.completeness}%).`,
  ].filter(Boolean).slice(0, 5);

  const risks = facts.anomalies > 0 || facts.outliers.length
    ? `Watch ${facts.outliers.map((o) => `${o.field} (${o.count} outliers)`).join(', ') || 'null-rate flags'}. Completeness ${facts.completeness}%.`
    : `No outlier fields were flagged. Completeness is ${facts.completeness}% on the loaded extract.`;

  const recommendations = [
    top ? `Investigate why ${top.key} accounts for ${top.sharePct}% of ${top.dimension} before scaling spend elsewhere.` : 'Load a dated measure to unlock trend-based actions.',
    facts.trend?.direction === 'down'
      ? `Arrest the ${facts.trend.deltaPct}% decline in ${facts.trend.measure}; start with the lagging dimension in Key findings.`
      : 'Keep the current mix instrumentation and re-run after the next load to confirm the period change.',
    'Treat every figure in this document as server-computed; do not paste unverified model output into investor materials.',
  ];

  const executiveSummary = [
    `${facts.title} covers ${facts.rowCount.toLocaleString()} rows and ${facts.columnCount} columns.`,
    kpiLine ? `Headline computed metrics: ${kpiLine}.` : '',
    trendLine,
    top ? `${top.key} is the largest ${top.dimension.toLowerCase()} slice at ${top.sharePct}%.` : '',
  ].filter(Boolean).join(' ');

  return {
    title: `${facts.title} — executive report`,
    executiveSummary,
    keyFindings,
    trends: trendLine,
    risks,
    recommendations,
    methodology: facts.methodology,
    source: 'fallback',
    fallbackReason: reason,
    generatedAt: new Date().toISOString(),
    generatedBy: 'template',
  };
}
