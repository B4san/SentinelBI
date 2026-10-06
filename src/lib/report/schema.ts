export const REPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['executiveSummary', 'keyFindings', 'trends', 'risks', 'recommendations', 'methodology'],
  properties: {
    executiveSummary: { type: 'string' },
    keyFindings: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
    trends: { type: 'string' },
    risks: { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
    methodology: { type: 'string' },
  },
} as const;

export function reportPrompt(facts: import('./types').ReportFacts, extras: { chat?: string; guidelines?: string; forbidden?: string }): string {
  const kpiBlock = facts.kpis.map((k) => `${k.label}: ${k.value} [${k.raw}] — ${k.context}`).join('\n');
  const rankBlock = facts.ranks.map((r) => `${r.dimension}/${r.key}: ${r.value} (${r.sharePct}%)`).join('\n');
  return `You are an executive briefing writer. Use ONLY the computed facts. Never invent a number, name, or percentage. If a section cannot be supported, write "Insufficient data in current scope."

Computed facts (authoritative):
Title: ${facts.title}
Rows: ${facts.rowCount}
Columns: ${facts.columnCount}
Completeness: ${facts.completeness}%
Anomalies: ${facts.anomalies}
KPIs:
${kpiBlock}
Mix:
${rankBlock || '(none)'}
Trend: ${facts.trend ? `${facts.trend.measure} ${facts.trend.deltaPct}% ${facts.trend.direction}` : '(none)'}
Outliers: ${facts.outliers.map((o) => `${o.field}:${o.count}`).join(', ') || '(none)'}
Verified findings:
${facts.findings.join('\n') || '(none)'}

Allowed number tokens: ${facts.tokens.join(' | ')}

Writer guidelines: ${extras.guidelines || 'Plain, specific, board-ready. No hype.'}
Forbidden: ${extras.forbidden || 'Do not recommend actions that require data not listed.'}
Recent chat (context only, not a source of numbers): ${extras.chat || '(none)'}

Return JSON with keys executiveSummary, keyFindings (array), trends, risks, recommendations (array), methodology.
Every numeral in the JSON must appear in the computed facts. Copy metric strings exactly.`;
}
