import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Sparkles, Upload, LayoutDashboard } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { HonestEmpty } from '../components/HonestEmpty';
import { generateContent } from '../lib/ai/client';
import { buildOverviewModel } from '../lib/overview/buildOverview';
import type { TopologyHealth } from '../lib/topology/buildTopology';

function MiniSpark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 26 - ((value - min) / span) * 22;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 32" className="mt-3 h-8 w-full" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="var(--nav-marker)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
        provider: aiSettings.provider,
        baseUrl: aiSettings.baseUrl,
        model: aiSettings.model,
        apiKey: aiSettings.apiKey,
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

  const healthDot = health?.ok ? 'var(--success)' : health?.ok === false ? 'var(--danger)' : 'var(--muted-foreground)';

  return (
    <div className="space-y-6 max-w-[1440px]">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h2 className="page-title truncate">{activeSpace.title} Overview</h2>
          <p className="page-subtitle mt-1">{activeSpace.description || 'Workspace data health and recent generation activity'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(activeSpace.datasets || []).slice(0, 3).map((ds) => (
            <span key={ds.id} className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-sm text-[var(--foreground)]">
              {ds.name} · {(ds.data?.length || 0).toLocaleString()} × {(ds.columns?.length || 0)}
            </span>
          ))}
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-sm text-[var(--foreground)]">
            <span className="h-2 w-2 rounded-full" style={{ background: healthDot }} aria-hidden />
            {model.providerLabel}
            {model.keySource === 'user' ? ' · your key' : model.keySource === 'env' ? ' · server key' : ' · no key'}
          </span>
        </div>
      </header>

      {!model.hasData ? (
        <Card>
          <CardContent className="py-10">
            <HonestEmpty
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
            <article key={kpi.id} className="surface-card rounded-[1.25rem] p-5 h-full min-w-0 overflow-hidden">
              <p className="text-sm text-[var(--muted-foreground)] truncate">{kpi.label}</p>
              <p className="dash-kpi-value mt-2 break-words text-[var(--foreground)]">{kpi.value}</p>
              <p className="text-sm text-[var(--muted-foreground)] mt-2">{kpi.context}</p>
              <MiniSpark values={kpi.sparkline} />
            </article>
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
                <HonestEmpty
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
                <HonestEmpty
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
                  <div className="flex justify-between gap-3 text-sm mb-1">
                    <span className="truncate text-[var(--foreground)]">{col.name} · {col.type}{col.outliers ? ` · ${col.outliers} outliers` : ''}</span>
                    <span className="tabular-nums text-[var(--foreground)]">{col.completeness}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--nav-marker)]" style={{ width: `${col.completeness}%` }} />
                  </div>
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
