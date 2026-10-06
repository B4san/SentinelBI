import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Activity, Sparkles, FileImage, FileText, Presentation, Layers, MousePointer2,
  BarChart2, Edit3, Save, RefreshCw, BookmarkPlus, Palette,
} from 'lucide-react';
import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import { ExecutiveReportBuilder } from '../components/ExecutiveReportBuilder';
import { DashboardCanvas, WidgetInspector } from '../components/dashboard/DashboardCanvas';
import { generateDashboardSpec, updateWidget } from '../lib/dashboard/generate';
import { applyThemeOverrides, validateDashboardSpec } from '../lib/dashboard/validate';
import { PALETTES } from '../lib/dashboard/palettes';
import { toDashboardDatasets } from '../lib/sampleData';
import type { DashboardSpec, LayoutArchetype } from '../lib/dashboard/types';
import { LAYOUT_ARCHETYPES } from '../lib/dashboard/types';

export function VisualModel() {
  const { spaceId } = useParams();
  const spaces = useStore((state) => state.spaces);
  const updateSpace = useStore((state) => state.updateSpace);
  const saveDashboard = useStore((state) => state.saveDashboard);
  const applySavedDashboard = useStore((state) => state.applySavedDashboard);
  const activeSpace = spaces.find((s) => s.id === spaceId);
  const [isExporting, setIsExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'report' | 'pipeline'>('dashboard');
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [presetName, setPresetName] = useState('');

  const datasets = useMemo(() => (activeSpace ? toDashboardDatasets(activeSpace) : []), [activeSpace]);
  const spec: DashboardSpec | null = useMemo(() => {
    if (!activeSpace) return null;
    const raw = activeSpace.dashboardSpec || activeSpace.visualInsights?.[0];
    if (!raw) return null;
    return validateDashboardSpec(raw, { title: activeSpace.title, intent: activeSpace.promptContext });
  }, [activeSpace]);

  if (!activeSpace) return null;

  const persist = (next: DashboardSpec) => {
    updateSpace(spaceId!, {
      dashboardSpec: next,
      visualInsights: [next as never],
      generatedCode: JSON.stringify(next, null, 2),
      executionState: 'completed',
    });
  };

  const runGenerate = async (instruction?: string, widgetId?: string, archetype?: LayoutArchetype) => {
    setBusy(true);
    setStatus(widgetId ? 'Reworking widget…' : 'Composing a new board…');
    const result = await generateDashboardSpec({
      title: activeSpace.title,
      intent: instruction || prompt || activeSpace.promptContext,
      datasets,
      existing: spec || undefined,
      widgetId,
      instruction,
      archetype,
    });
    persist(result.spec);
    setStatus(result.source === 'ai' ? 'Generated from the configured provider.' : result.error || 'Used a data-fitted layout (no live model).');
    setBusy(false);
    setPrompt('');
  };

  const selected = spec?.widgets.find((w) => w.id === selectedId);

  const handleExportImage = async () => {
    setIsExporting(true);
    try {
      const element = document.getElementById('exportable-space');
      if (!element) return;
      const canvas = await toCanvas(element, { backgroundColor: spec?.theme.palette.background || '#ffffff' });
      const link = document.createElement('a');
      link.download = `${activeSpace.title.replace(/\s+/g, '_')}_Dashboard.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const reportContent = activeSpace.executiveReport?.summary || 'No executive report generated yet.';
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.setFontSize(22);
      pdf.text(activeSpace.title, 20, 28);
      pdf.setFontSize(11);
      const split = pdf.splitTextToSize(reportContent.replace(/[#*]/g, ''), 170);
      pdf.text(split.slice(0, 40), 20, 42);
      const element = document.getElementById('exportable-space');
      if (element && activeTab === 'dashboard') {
        const canvas = await toCanvas(element, { backgroundColor: '#ffffff', pixelRatio: 2 });
        pdf.addPage('l');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, pdfWidth - 20, Math.min(pdfHeight, 190));
      }
      pdf.save(`${activeSpace.title.replace(/\s+/g, '_')}_Report.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPPTX = async () => {
    setIsExporting(true);
    try {
      const pres = new PptxGenJS();
      const slide = pres.addSlide();
      slide.addText(activeSpace.title, { x: 0.6, y: 2, w: '85%', fontSize: 32, bold: true });
      slide.addText(spec?.narrative?.headline || 'Executive operations review', { x: 0.6, y: 2.8, w: '85%', fontSize: 16 });
      const element = document.getElementById('exportable-space');
      if (element) {
        const canvas = await toCanvas(element, { backgroundColor: '#ffffff', pixelRatio: 2 });
        const dash = pres.addSlide();
        dash.addImage({ data: canvas.toDataURL('image/png'), x: 0.4, y: 0.4, w: 9.2, h: 5.1 });
      }
      await pres.writeFile({ fileName: `${activeSpace.title.replace(/\s+/g, '_')}_Presentation.pptx` });
    } finally {
      setIsExporting(false);
    }
  };

  if (!spec) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5 border border-[var(--border)] bg-[var(--card)]">
          <Layers className="w-9 h-9 text-[var(--primary)]" />
          <MousePointer2 className="w-4 h-4 -ml-3 mt-6 text-[var(--muted-foreground)]" />
        </div>
        <h2 className="page-title mb-2">No dashboard yet</h2>
        <p className="page-subtitle max-w-md mb-6">
          Generate a board fitted to this space’s data and intent. Each run picks a different layout, palette, and chart mix.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xl">
          <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Optional: what should this board emphasize?" />
          <Button onClick={() => runGenerate(prompt)} disabled={busy || datasets.length === 0}>
            <Sparkles className="w-4 h-4 mr-2" /> {busy ? 'Generating…' : 'Generate dashboard'}
          </Button>
        </div>
        {datasets.length === 0 && <p className="text-sm text-amber-600 mt-4">Upload a dataset first.</p>}
        {status && <p className="text-sm text-[var(--muted-foreground)] mt-4">{status}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col xl:flex-row justify-between gap-4">
        <div>
          <h2 className="page-title">{spec.title}</h2>
          <p className="page-subtitle mt-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            {spec.archetype.replace(/-/g, ' ')} · seed {spec.seed}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={activeTab === 'dashboard' ? 'default' : 'outline'} onClick={() => setActiveTab('dashboard')}><BarChart2 className="w-4 h-4 mr-2" />Dashboard</Button>
          <Button variant={activeTab === 'report' ? 'default' : 'outline'} onClick={() => setActiveTab('report')}><FileText className="w-4 h-4 mr-2" />Report</Button>
          <Button variant={activeTab === 'pipeline' ? 'default' : 'outline'} onClick={() => setActiveTab('pipeline')}><Activity className="w-4 h-4 mr-2" />Pipeline</Button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <Button variant={editing ? 'default' : 'outline'} onClick={() => setEditing((v) => !v)}>
                {editing ? <Save className="w-4 h-4 mr-2" /> : <Edit3 className="w-4 h-4 mr-2" />}
                {editing ? 'Done' : 'Edit layout'}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => runGenerate(prompt || 'Regenerate a completely different composition')}>
                <RefreshCw className={`w-4 h-4 mr-2 ${busy ? 'animate-spin' : ''}`} /> Regenerate
              </Button>
              <select
                className="h-11 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 text-sm"
                value={spec.archetype}
                onChange={(e) => runGenerate(`Use the ${e.target.value} archetype`, undefined, e.target.value as LayoutArchetype)}
              >
                {LAYOUT_ARCHETYPES.map((a) => <option key={a} value={a}>{a.replace(/-/g, ' ')}</option>)}
              </select>
              <select
                className="h-11 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 text-sm"
                value={spec.theme.palette.id}
                onChange={(e) => persist(applyThemeOverrides(spec, { paletteId: e.target.value }))}
              >
                {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={handleExportPDF} disabled={isExporting}><FileText className="w-4 h-4 mr-2 text-red-500" />PDF</Button>
              <Button variant="ghost" size="sm" onClick={handleExportPPTX} disabled={isExporting}><Presentation className="w-4 h-4 mr-2 text-amber-500" />PPTX</Button>
              <Button variant="ghost" size="sm" onClick={handleExportImage} disabled={isExporting}><FileImage className="w-4 h-4 mr-2 text-blue-500" />PNG</Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
              <Sparkles className="w-4 h-4 text-[var(--primary)] hidden lg:block" />
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask to restyle, add a cohort filter, or rebuild around a question…"
                onKeyDown={(e) => e.key === 'Enter' && runGenerate(prompt)}
              />
              <Button onClick={() => runGenerate(prompt)} disabled={busy || !prompt.trim()}>Apply prompt</Button>
              <div className="flex gap-2 w-full lg:w-auto">
                <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" className="lg:w-40" />
                <Button
                  variant="outline"
                  disabled={!presetName.trim()}
                  onClick={() => {
                    saveDashboard(spaceId!, presetName.trim(), spec);
                    setPresetName('');
                    setStatus('Preset saved in this space.');
                  }}
                >
                  <BookmarkPlus className="w-4 h-4 mr-2" /> Save
                </Button>
              </div>
            </CardContent>
          </Card>

          {(activeSpace.savedDashboards || []).length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <Palette className="w-4 h-4 text-[var(--muted-foreground)]" />
              {(activeSpace.savedDashboards || []).map((dash) => (
                <Button key={dash.id} variant={activeSpace.activeDashboardId === dash.id ? 'default' : 'outline'} size="sm" onClick={() => applySavedDashboard(spaceId!, dash.id)}>
                  {dash.name}
                </Button>
              ))}
            </div>
          )}

          {status && <p className="text-sm text-[var(--muted-foreground)]">{status}</p>}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
            <div id="exportable-space">
              <DashboardCanvas
                spec={spec}
                datasets={datasets}
                editing={editing}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChange={persist}
                onRegenerateWidget={(id) => runGenerate(`Regenerate only widget ${id} with a different but still relevant encoding.`, id)}
              />
            </div>
            {editing && selected && (
              <Card className="h-fit sticky top-4">
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-3">Widget</h3>
                  <WidgetInspector
                    spec={spec}
                    widget={selected}
                    datasets={datasets}
                    onChange={(widget) => persist(updateWidget(spec, widget.id, widget))}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {activeTab === 'report' && <ExecutiveReportBuilder spaceId={spaceId!} />}

      {activeTab === 'pipeline' && (
        <Card className="p-8">
          <h3 className="text-xl font-bold">Render pipeline</h3>
          <p className="text-[var(--muted-foreground)] mt-2">Spec version {spec.version} · {spec.widgets.length} widgets · {datasets.reduce((n, d) => n + d.data.length, 0)} rows bound.</p>
          <pre className="mt-6 bg-[#11131a] text-emerald-400 rounded-2xl p-5 text-xs overflow-auto max-h-80">
{`> validating dashboard spec... OK
> archetype: ${spec.archetype}
> palette: ${spec.theme.palette.id}
> widgets: ${spec.widgets.map((w) => w.type).join(', ')}`}
          </pre>
        </Card>
      )}
    </div>
  );
}
