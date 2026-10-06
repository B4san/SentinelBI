import React, { useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { FileText, Loader2, Play, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toDashboardDatasets } from '../lib/sampleData';
import type { ExecutiveReportDoc } from '../lib/report/types';

export function ExecutiveReportBuilder({ spaceId }: { spaceId: string }) {
  const spaces = useStore((state) => state.spaces);
  const updateSpace = useStore((state) => state.updateSpace);
  const aiSettings = useStore((state) => state.aiSettings);
  const activeSpace = spaces.find((s) => s.id === spaceId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async () => {
    if (!activeSpace) return;
    const policies = activeSpace.policies || {
      securityLevel: 'Standard' as const,
      piiRedaction: true,
      requireHumanReviewThreshold: 75,
      maxExportRows: 10000,
      allowExecutiveExport: true,
    };
    if (!policies.allowExecutiveExport) {
      setError('Executive export is disabled by governance policy for this workspace.');
      return;
    }
    setIsGenerating(true);
    setProgress(20);
    setError(null);
    try {
      const datasets = toDashboardDatasets(activeSpace);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (aiSettings.apiKey) headers['x-api-key'] = aiSettings.apiKey;
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: activeSpace.title,
          intent: activeSpace.promptContext || activeSpace.description,
          datasets,
          chatContext: (activeSpace.chatMessages || []).slice(-5).map((m) => m.content).join('\n'),
          policies,
          provider: aiSettings.provider,
          baseUrl: aiSettings.baseUrl,
          model: aiSettings.model,
        }),
      });
      setProgress(70);
      const data = await res.json().catch(() => ({})) as ExecutiveReportDoc & { error?: string };
      if (!data?.markdown && !data?.executiveSummary) {
        throw new Error(data.error || `Report request failed (${res.status})`);
      }
      if (data.error && data.source !== 'fallback' && data.source !== 'ai') {
        throw new Error(data.error);
      }
      updateSpace(spaceId, {
        executiveReport: {
          summary: data.markdown,
          markdown: data.markdown,
          datasetOverview: `${data.facts?.rowCount ?? 0} rows · ${data.facts?.columnCount ?? 0} columns`,
          kpiAnalysis: (data.facts?.kpis || []).map((k) => `${k.label} ${k.value}`).join('; '),
          trends: data.trends,
          anomalies: data.risks,
          segments: (data.facts?.ranks || []).map((r) => `${r.key} ${r.sharePct}%`).join('; '),
          forecasts: 'Not in scope — this report does not invent forward numbers.',
          recommendations: data.recommendations.join(' '),
          governance: `${activeSpace.securityEvents?.length || 0} policy events logged`,
          source: data.source,
          fallbackReason: data.fallbackReason,
          error: data.error,
          generatedBy: data.generatedBy,
          generatedAt: data.generatedAt,
        },
      });
      if (data.source === 'fallback') {
        setError(data.fallbackReason || data.error || 'Used the computed template because the model did not produce a verified draft.');
      }
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setProgress(0);
      }, 300);
    }
  };

  if (!activeSpace) return null;
  const report = activeSpace.executiveReport;
  const policies = activeSpace.policies || {
    securityLevel: 'Standard' as const,
    piiRedaction: true,
    requireHumanReviewThreshold: 75,
    maxExportRows: 10000,
    allowExecutiveExport: true,
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]" role="alert">
          {error}
        </div>
      )}

      {!report && !isGenerating && (
        <Card className="border border-[var(--border)] p-12 text-center bg-[var(--card)]">
          <div className="w-20 h-20 bg-[var(--surface-muted)] rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="w-8 h-8 text-[var(--nav-active-fg)]" />
          </div>
          <h3 className="text-2xl font-bold text-[var(--foreground)] mb-2 tracking-tight">Executive report</h3>
          <p className="text-[var(--muted-foreground)] max-w-md mx-auto mb-8 font-medium">
            The server computes every figure first. The model may draft the narrative; if it fails or invents a number, you get a labelled template instead of a blank page.
          </p>
          <Button onClick={generateReport} size="lg" disabled={!policies.allowExecutiveExport}>
            <Play className="w-4 h-4 mr-2" /> Generate report
          </Button>
          {!policies.allowExecutiveExport && (
            <p className="text-[var(--danger)] text-xs font-bold mt-4 uppercase tracking-wider">Disabled by workspace governance policy</p>
          )}
        </Card>
      )}

      {isGenerating && (
        <Card className="border border-[var(--border)] p-12 text-center bg-[var(--card)]">
          <Loader2 className="w-12 h-12 text-[var(--nav-marker)] animate-spin mx-auto mb-6" />
          <h3 className="text-xl font-bold text-[var(--foreground)] mb-4 tracking-tight">Computing verified metrics…</h3>
          <div className="max-w-md mx-auto bg-[var(--muted)] rounded-full h-2 mb-3 overflow-hidden">
            <div className="bg-[var(--nav-marker)] h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm font-medium text-[var(--muted-foreground)]">
            {progress < 40 ? 'Running DataTruthEngine and derived measures…' : 'Drafting narrative against the fact list…'}
          </p>
        </Card>
      )}

      {report && !isGenerating && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-[var(--card)] p-4 rounded-[1.5rem] border border-[var(--border)]">
            <div>
              <h4 className="font-bold text-[var(--foreground)]">
                {report.source === 'fallback' ? 'Computed template (labelled fallback)' : 'Executive report'}
              </h4>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mt-1">
                {report.generatedBy || 'template'} · {report.datasetOverview}
              </p>
            </div>
            <Button variant="outline" onClick={generateReport}>
              <RefreshCw className="w-4 h-4 mr-2" /> Re-generate
            </Button>
          </div>
          <Card className="border border-[var(--border)] rounded-[1.5rem] overflow-hidden bg-[var(--card)]">
            <CardContent className="p-10 prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-p:leading-relaxed text-[var(--foreground)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.markdown || report.summary}
              </ReactMarkdown>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
