import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Sparkles, Upload, LayoutDashboard } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { MetricCard } from '../components/arc/metric-card/metric-card';
import { Progress } from '../components/arc/progress/progress';
import { EmptyState } from '../components/arc/empty-state/empty-state';
import { Badge } from '../components/arc/badge/badge';
import { Sparkline } from '../components/arc/sparkline/sparkline';
import { generateContent } from '../lib/ai/client';
import { buildOverviewModel } from '../lib/overview/buildOverview';
import type { TopologyHealth } from '../lib/topology/buildTopology';

export function Dashboard() {
  const navigate = useNavigate();
  const { spaceId } = useParams();
  const spaces = useStore((state) => state.spaces);
  const aiSettings = useStore((state) => state.aiSettings);
  const activeSpace = spaces.find((s) => s.id === spaceId);
  const [health, setHealth] = useState<TopologyHealth | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch(() => setHealth({ ok: false }));
  }, []);

  const model = useMemo(
    () => (activeSpace ? buildOverviewModel(activeSpace, aiSettings, health) : null),
    [activeSpace, aiSettings, health],
  );

  if (!activeSpace || !model) return null;

  const handleExplain = async () => {
    setExplaining(true);
    setExplainError(null);
    setExplanation(null);
    try {
      const data = await generateContent({
        contents: `You are a BI data analyst. In 2-3 sentences, explain this workspace using only the numbers given. Space: ${activeSpace.title}. Rows: ${model.rowCount}. Completeness: ${model.completeness ?? 'n/a'}%. Anomalies: ${model.anomalies}. KPIs: ${model.kpis.map((k) => `${k.label} ${k.value}`).join('; ') || 'none'}.`,
      });
      setExplanation(data.text || 'No explanation returned.');
    } catch (error) {
      setExplainError(error instanceof Error ? error.message : 'Explain failed');
    } finally {
      setExplaining(false);
    }
  };

  const activityChart = model.activity
    .slice()
    .reverse()
    .reduce<{ name: string; count: number }[]>((acc, item) => {
      const name = new Date(item.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const found = acc.find((row) => row.name === name);
      if (found) found.count += 1;
      else acc.push({ name, count: 1 });
      return acc;
    }, []);

  const statusTone = health?.ok ? 'success' : health?.ok === false ? 'warning' : 'neutral';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-[1440px]">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h2 className="page-title truncate">{activeSpace.title} Overview</h2>
          <p className="page-subtitle mt-1">{activeSpace.description || 'Workspace data health and recent generation activity'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(activeSpace.datasets || []).slice(0, 3).map((ds) => (
            <Badge key={ds.id} tone="neutral" size="sm">
              {ds.name} · {(ds.data?.length || 0).toLocaleString()} × {(ds.columns?.length || 0)}
            </Badge>
          ))}
          <Badge tone={statusTone} size="sm">
            {model.providerLabel}
            {model.keySource === 'user' ? ' · your key' : model.keySource === 'env' ? ' · server key' : ' · no key'}
          </Badge>
        </div>
      </header>

      {!model.hasData ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              title="No dataset loaded"
              description="Upload a CSV to compute real KPIs, completeness, and activity. Nothing here is estimated."
              action={
                <Button onClick={() => navigate(`/space/${spaceId}/data`)}>Open Data Sources</Button>
              }
              icon={<Upload width={24} height={24} />}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {model.kpis.map((kpi) => (
            <div key={kpi.id} className="min-w-0">
              {Number.isFinite(kpi.raw) && /%$/.test(kpi.value) === false && kpi.value === kpi.raw.toLocaleString() ? (
                <MetricCard label={kpi.label} value={kpi.raw} context={kpi.context} change={kpi.change} />
              ) : (
                <article className="surface-card rounded-[1.25rem] p-5 h-full min-w-0 overflow-hidden">
                  <p className="text-sm text-[var(--muted-foreground)] truncate">{kpi.label}</p>
                  <p className="dash-kpi-value mt-2 break-words">{kpi.value}</p>
                  <p className="text-sm text-[var(--muted-foreground)] mt-2">{kpi.context}</p>
                  {kpi.sparkline.length > 1 && (
                    <div className="mt-3">
                      <Sparkline data={kpi.sparkline} label={kpi.label} area />
                    </div>
                  )}
                </article>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <div className="space-y-6 min-w-0">
          {model.latestDashboard ? (
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle>Latest dashboard</CardTitle>
                <CardDescription>
                  {model.latestDashboard.generatedBy || 'layout engine'} · {new Date(model.latestDashboard.createdAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{model.latestDashboard.title}</p>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">
                    {model.latestDashboard.widgets} widgets
                    {model.latestDashboard.archetype ? ` · ${model.latestDashboard.archetype}` : ''}
                  </p>
                </div>
                <Button onClick={() => navigate(`/space/${spaceId}/visuals`)}>
                    <LayoutDashboard className="w-4 h-4 mr-2" /> Open Visual Model
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8">
                <EmptyState
                  title="No dashboard yet"
                  description="Generate a board fitted to this space’s actual columns and measures."
                  action={
                    <Button onClick={() => navigate(`/space/${spaceId}/visuals`)}>Generate your first dashboard</Button>
                  }
                />
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Activity</CardTitle>
                <CardDescription>Chats, executions, and generation attempts</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExplain} disabled={explaining}>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> {explaining ? 'Explaining…' : 'Explain'}
              </Button>
            </CardHeader>
            <CardContent>
              {(explainError || explanation) && (
                <p className={`text-sm mb-4 ${explainError ? 'text-[var(--danger)]' : 'text-[var(--foreground)]'}`}>
                  {explainError || explanation}
                </p>
              )}
              {activityChart.length > 0 ? (
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          color: 'var(--foreground)',
                        }}
                      />
                      <Area type="monotone" dataKey="count" stroke="var(--nav-marker)" fill="var(--nav-active-bg)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No activity yet"
                  description="Generate a dashboard or start a chat to populate this timeline."
                  action={
                    <Button variant="outline" onClick={() => navigate(`/space/${spaceId}/visuals`)}>Generate your first dashboard</Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>Data health</CardTitle>
              <CardDescription>Per-column completeness from loaded rows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {model.columns.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">Load data to profile columns.</p>
              )}
              {model.columns.map((col) => (
                <div key={col.name} className="min-w-0">
                  <Progress
                    value={col.completeness}
                    label={`${col.name} · ${col.type}${col.outliers ? ` · ${col.outliers} outliers` : ''}`}
                    showValue
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>Newest events first</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {model.activity.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">No events logged yet.</p>
              )}
              {model.activity.map((item) => (
                <div key={item.id} className="border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
                  <p className="text-xs text-[var(--muted-foreground)]">{new Date(item.at).toLocaleString()}</p>
                  <p className="text-sm font-semibold mt-1">{item.title}</p>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1 break-words">{item.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
