import { classifyFields, prettyField } from '../dashboard/insights';
import { proposeDerivedMeasures } from '../dashboard/measures';
import type { GenerateAttempt } from '../dashboard/generate';
import type { ProviderConfig } from '../ai/types';
import type { Space } from '../../store';

export type TopologyNodeKind =
  | 'source'
  | 'dataset'
  | 'ai'
  | 'step'
  | 'fallback'
  | 'dashboard'
  | 'chat'
  | 'export';

export type TopologyStatus = 'ok' | 'fallback' | 'error' | 'idle' | 'running';

export interface TopologyHealth {
  ok?: boolean;
  provider?: string;
  model?: string;
  hasServerKey?: boolean;
}

export interface TopologyNodeModel {
  id: string;
  kind: TopologyNodeKind;
  label: string;
  subtitle?: string;
  status: TopologyStatus;
  detail?: Record<string, string | number | boolean | undefined>;
  position?: { x: number; y: number };
}

export interface TopologyEdgeModel {
  id: string;
  source: string;
  target: string;
  label?: string;
  status: TopologyStatus;
  animated?: boolean;
}

export interface TopologyGraph {
  nodes: TopologyNodeModel[];
  edges: TopologyEdgeModel[];
  empty: boolean;
}

export interface GenerationRunLike {
  at?: string;
  source?: 'ai' | 'fallback';
  model?: string;
  provider?: string;
  keySource?: 'user' | 'env' | 'none';
  fallbackReason?: string;
  attempts?: GenerateAttempt[];
}

const COL_X = [40, 320, 600, 880];
const ROW_Y = 92;

export function layoutTopology(graph: TopologyGraph, positions?: Record<string, { x: number; y: number }>): TopologyGraph {
  const columns: Record<TopologyNodeKind, number> = {
    source: 0,
    dataset: 1,
    ai: 2,
    step: 2,
    fallback: 2,
    dashboard: 3,
    chat: 3,
    export: 3,
  };
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const nodes = graph.nodes.map((node) => {
    const col = columns[node.kind] ?? 1;
    const saved = positions?.[node.id];
    const x = saved?.x ?? COL_X[col];
    const y = saved?.y ?? 40 + counts[col] * ROW_Y;
    counts[col] += 1;
    return { ...node, position: { x, y } };
  });
  return { ...graph, nodes };
}

function lastRun(space: Pick<Space, 'generationRuns'>): GenerationRunLike | undefined {
  return space.generationRuns?.[0];
}

function attemptStatus(attempt?: GenerateAttempt): TopologyStatus {
  if (!attempt) return 'idle';
  if (attempt.status === 429 || (attempt.status && attempt.status >= 400)) return 'error';
  if (attempt.error) return 'fallback';
  if (attempt.status === 200) return 'ok';
  return 'idle';
}

function pipelineStatus(run?: GenerationRunLike, inFlight?: boolean): TopologyStatus {
  if (inFlight) return 'running';
  if (!run) return 'idle';
  if (run.source === 'fallback') return 'fallback';
  const failed = (run.attempts || []).some((a) => a.status && a.status >= 400);
  if (failed) return 'error';
  return 'ok';
}

export function buildTopology(
  space: Space,
  aiSettings?: ProviderConfig | null,
  health?: TopologyHealth | null,
  opts?: { inFlight?: boolean },
): TopologyGraph {
  const nodes: TopologyNodeModel[] = [];
  const edges: TopologyEdgeModel[] = [];

  const files = space.uploadedFiles || [];
  const datasets = (space.datasets && space.datasets.length > 0)
    ? space.datasets
    : space.parsedData?.length
      ? [{
          id: 'legacy',
          name: 'Primary dataset',
          type: 'csv',
          data: space.parsedData,
          columns: space.columns || [],
          lastSyncTimestamp: space.updatedAt,
        }]
      : [];

  const hasData = files.length > 0 || datasets.some((d) => (d.data || []).length > 0);
  if (!hasData) {
    return { nodes, edges, empty: true };
  }

  const sourceIds: string[] = [];
  if (files.length > 0) {
    files.forEach((file) => {
      const id = `src-${file.id}`;
      sourceIds.push(id);
      nodes.push({
        id,
        kind: 'source',
        label: file.name,
        subtitle: file.type || 'file',
        status: 'ok',
        detail: { size: file.size, type: file.type },
      });
    });
  } else {
    datasets.forEach((ds) => {
      const id = `src-${ds.id}`;
      sourceIds.push(id);
      nodes.push({
        id,
        kind: 'source',
        label: ds.name,
        subtitle: ds.type || 'connection',
        status: ds.refreshStatus === 'failed' ? 'error' : 'ok',
        detail: { rows: ds.data?.length || 0, columns: ds.columns?.length || 0, loaded: ds.lastSyncTimestamp },
      });
    });
  }

  const datasetIds: string[] = [];
  datasets.forEach((ds, index) => {
    const id = `ds-${ds.id}`;
    datasetIds.push(id);
    const asDash = {
      id: ds.id,
      name: ds.name,
      data: ds.data || [],
      columns: ds.columns || [],
    };
    const fields = classifyFields(asDash);
    const derived = proposeDerivedMeasures(asDash).map((m) => m.title);
    const rows = ds.data?.length || 0;
    const cols = ds.columns?.length || Object.keys(ds.data?.[0] || {}).length;
    nodes.push({
      id,
      kind: 'dataset',
      label: ds.name,
      subtitle: `${rows.toLocaleString()} × ${cols} · ${(fields.measures.length)} measures`,
      status: rows > 0 ? 'ok' : 'idle',
      detail: {
        rows,
        columns: cols,
        measures: fields.measures.join(', '),
        dimensions: fields.dimensions.join(', '),
        derived: derived.join(', ') || undefined,
        loaded: ds.lastSyncTimestamp,
      },
    });
    const source = sourceIds[Math.min(index, sourceIds.length - 1)];
    if (source) {
      edges.push({
        id: `e-${source}-${id}`,
        source,
        target: id,
        label: 'load',
        status: rows > 0 ? 'ok' : 'idle',
      });
    }
  });

  const run = lastRun(space);
  const provider = aiSettings?.provider || health?.provider || 'gemini';
  const model = aiSettings?.model || health?.model || run?.model || 'unconfigured';
  const keySource = run?.keySource || (aiSettings?.apiKey ? 'user' : health?.hasServerKey ? 'env' : 'none');
  const aiStatus = pipelineStatus(run, opts?.inFlight);
  const aiId = 'ai-provider';
  nodes.push({
    id: aiId,
    kind: 'ai',
    label: `${provider} / ${model}`,
    subtitle: keySource === 'user' ? 'your key' : keySource === 'env' ? 'server key' : 'no key',
    status: aiStatus,
    detail: { provider, model, keySource, health: health?.ok ? 'ok' : 'unknown' },
  });
  datasetIds.forEach((dsId) => {
    edges.push({
      id: `e-${dsId}-${aiId}`,
      source: dsId,
      target: aiId,
      label: 'analyze',
      status: aiStatus,
      animated: Boolean(opts?.inFlight),
    });
  });

  let lastPipeId = aiId;
  const attempts = (run?.attempts || []).filter((a) => a.step !== 'resolve');
  attempts.forEach((attempt, i) => {
    const id = `step-${attempt.step}-${i}`;
    const status = attemptStatus(attempt);
    nodes.push({
      id,
      kind: 'step',
      label: attempt.step,
      subtitle: `${attempt.model || model} · ${attempt.ms}ms`,
      status,
      detail: {
        status: attempt.status,
        ms: attempt.ms,
        error: attempt.error,
        model: attempt.model,
        keySource: attempt.keySource,
      },
    });
    edges.push({
      id: `e-${lastPipeId}-${id}`,
      source: lastPipeId,
      target: id,
      label: attempt.step,
      status,
      animated: Boolean(opts?.inFlight) && i === attempts.length - 1,
    });
    lastPipeId = id;
  });

  if (run?.source === 'fallback') {
    const id = 'fallback';
    nodes.push({
      id,
      kind: 'fallback',
      label: 'Data-fitted fallback',
      subtitle: run.fallbackReason || 'fallback used',
      status: 'fallback',
      detail: { reason: run.fallbackReason },
    });
    edges.push({
      id: `e-${lastPipeId}-fallback`,
      source: lastPipeId,
      target: id,
      status: 'fallback',
    });
    lastPipeId = id;
  }

  const dashboards = [
    ...(space.savedDashboards || []).map((d) => ({
      id: d.id,
      title: d.name || d.spec.title,
      widgets: d.spec.widgets?.length || 0,
      archetype: d.spec.archetype,
      generatedBy: d.spec.generatedBy,
      createdAt: d.createdAt,
    })),
    ...(space.dashboardSpec && !(space.savedDashboards || []).some((d) => d.spec.id === space.dashboardSpec?.id)
      ? [{
          id: space.dashboardSpec.id,
          title: space.dashboardSpec.title,
          widgets: space.dashboardSpec.widgets?.length || 0,
          archetype: space.dashboardSpec.archetype,
          generatedBy: space.dashboardSpec.generatedBy,
          createdAt: space.updatedAt,
        }]
      : []),
  ];

  dashboards.forEach((dash) => {
    const id = `dash-${dash.id}`;
    nodes.push({
      id,
      kind: 'dashboard',
      label: dash.title,
      subtitle: `${dash.widgets} widgets · ${dash.archetype || 'board'}`,
      status: dash.generatedBy ? 'ok' : run?.source === 'fallback' ? 'fallback' : 'ok',
      detail: {
        widgets: dash.widgets,
        archetype: dash.archetype,
        generatedBy: dash.generatedBy,
        createdAt: dash.createdAt,
      },
    });
    edges.push({
      id: `e-${lastPipeId}-${id}`,
      source: lastPipeId,
      target: id,
      label: 'generate',
      status: run?.source === 'fallback' ? 'fallback' : 'ok',
    });
  });

  const chatCount = space.chatMessages?.length || 0;
  if (chatCount > 0) {
    nodes.push({
      id: 'chat',
      kind: 'chat',
      label: 'AI Workspace',
      subtitle: `${chatCount} messages`,
      status: 'ok',
      detail: { messages: chatCount },
    });
    datasetIds.forEach((dsId) => {
      edges.push({
        id: `e-${dsId}-chat`,
        source: dsId,
        target: 'chat',
        label: 'ask',
        status: 'ok',
      });
    });
  }

  if (space.generatedCode) {
    nodes.push({
      id: 'export',
      kind: 'export',
      label: 'Exports',
      subtitle: 'Generated artifacts',
      status: 'ok',
    });
    dashboards.forEach((dash) => {
      edges.push({
        id: `e-dash-${dash.id}-export`,
        source: `dash-${dash.id}`,
        target: 'export',
        label: 'export',
        status: 'ok',
      });
    });
  }

  return { nodes, edges, empty: nodes.length === 0 };
}

export function prettyNodeKind(kind: TopologyNodeKind): string {
  return prettyField(kind);
}
