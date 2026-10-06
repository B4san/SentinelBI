import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  Panel,
  type Node,
  type Edge,
  type NodeChange,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../store';
import { Button } from '../components/ui/button';
import { HonestEmpty } from '../components/HonestEmpty';
import { Save, Upload, X } from 'lucide-react';
import {
  buildTopology,
  layoutTopology,
  type TopologyHealth,
  type TopologyNodeKind,
  type TopologyNodeModel,
  type TopologyStatus,
} from '../lib/topology/buildTopology';

const STATUS_COLOR: Record<TopologyStatus, { light: string; dark: string }> = {
  ok: { light: '#059669', dark: '#34d399' },
  fallback: { light: '#d97706', dark: '#fbbf24' },
  error: { light: '#e11d48', dark: '#fb7185' },
  idle: { light: '#64748b', dark: '#94a3b8' },
  running: { light: '#2563eb', dark: '#60a5fa' },
};

function statusColor(status: TopologyStatus, mode: 'light' | 'dark') {
  return STATUS_COLOR[status][mode];
}

const KIND_LABEL: Record<TopologyNodeKind, string> = {
  source: 'Source',
  dataset: 'Dataset',
  ai: 'AI',
  step: 'Generation step',
  fallback: 'Fallback',
  dashboard: 'Dashboard',
  chat: 'Chat',
  export: 'Export',
};

function flowNodes(models: TopologyNodeModel[]): Node[] {
  return models.map((node) => ({
    id: node.id,
    position: node.position || { x: 0, y: 0 },
    data: { model: node },
    type: 'lineage',
  }));
}

function flowEdges(graphEdges: ReturnType<typeof buildTopology>['edges'], mode: 'light' | 'dark'): Edge[] {
  return graphEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.animated || edge.status === 'running',
    style: { stroke: statusColor(edge.status, mode), strokeWidth: 2.5 },
    labelStyle: { fill: mode === 'dark' ? '#e8eef7' : '#0f172a', fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: mode === 'dark' ? '#141c2e' : '#ffffff' },
  }));
}

function LineageNode({ data }: { data: { model: TopologyNodeModel } }) {
  const node = data.model;
  const bar =
    node.status === 'ok' ? 'var(--success)'
    : node.status === 'fallback' ? 'var(--warning)'
    : node.status === 'error' ? 'var(--danger)'
    : node.status === 'running' ? 'var(--nav-marker)'
    : 'var(--muted-foreground)';
  return (
    <div
      className="rounded-xl border px-3 py-2 min-w-[160px] max-w-[220px] shadow-sm"
      style={{
        background: 'var(--card)',
        color: 'var(--card-foreground)',
        borderColor: 'var(--border)',
        borderLeft: `4px solid ${bar}`,
      }}
    >
      <p className="text-[10px] uppercase tracking-wide font-semibold text-[var(--foreground)]">{KIND_LABEL[node.kind]}</p>
      <p className="text-[13px] font-semibold leading-snug mt-0.5 break-words">{node.label}</p>
      {node.subtitle && <p className="text-[11px] font-medium text-[var(--foreground)] mt-1 break-words">{node.subtitle}</p>}
    </div>
  );
}

const nodeTypes = { lineage: LineageNode };

export function TopologyLab() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const spaces = useStore((state) => state.spaces);
  const aiSettings = useStore((state) => state.aiSettings);
  const appearance = useStore((state) => state.appearance);
  const saveTopologyLayout = useStore((state) => state.saveTopologyLayout);
  const activeSpace = spaces.find((s) => s.id === spaceId);
  const [health, setHealth] = useState<TopologyHealth | null>(null);
  const [selected, setSelected] = useState<TopologyNodeModel | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false }));
  }, []);

  const graph = useMemo(
    () => (activeSpace
      ? layoutTopology(
          buildTopology(activeSpace, aiSettings, health, { inFlight: activeSpace.executionState === 'running' }),
          activeSpace.topologyLayout,
        )
      : { nodes: [], edges: [], empty: true }),
    [activeSpace, aiSettings, health],
  );

  useEffect(() => {
    setNodes(flowNodes(graph.nodes));
    setEdges(flowEdges(graph.edges, appearance.mode));
    setSelected(null);
  }, [graph, appearance.mode]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const handleSave = () => {
    if (!spaceId) return;
    const layout: Record<string, { x: number; y: number }> = {};
    nodes.forEach((node) => {
      layout[node.id] = node.position;
    });
    saveTopologyLayout(spaceId, layout);
  };

  if (!activeSpace) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h2 className="page-title">Pipeline topology</h2>
          <p className="page-subtitle mt-1">Lineage from this workspace’s files, datasets, provider, and generated boards.</p>
        </div>
        <div className="flex items-center gap-2">
          {!graph.empty && (
            <span className="text-sm font-medium text-[var(--foreground)]">
              {graph.nodes.length} nodes · {graph.edges.filter((e) => e.status === 'ok').length} healthy edges
            </span>
          )}
          <Button variant="outline" onClick={handleSave} disabled={graph.empty}>
            <Save className="w-4 h-4 mr-2" /> Save layout
          </Button>
        </div>
      </div>

      {graph.empty ? (
        <div className="flex-1 surface-card rounded-3xl grid place-items-center">
          <HonestEmpty
            title="Upload a CSV to see your pipeline"
            description="Sources, datasets, the configured model, and generated dashboards appear here once this space has data."
            action={
              <Button onClick={() => navigate(`/space/${spaceId}/data`)}><Upload className="w-4 h-4 mr-2" /> Data Sources</Button>
            }
          />
        </div>
      ) : (
        <div className="flex-1 w-full relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onNodeClick={(_e, node) => setSelected((node.data as { model: TopologyNodeModel }).model)}
            nodeTypes={nodeTypes}
            fitView
            colorMode={appearance.mode}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border)" gap={18} size={1} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              nodeColor={() => 'var(--nav-marker)'}
            />
            {selected && (
              <Panel position="top-right" className="max-w-sm">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-lg text-[var(--card-foreground)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">{KIND_LABEL[selected.kind]}</p>
                      <h3 className="font-semibold mt-1">{selected.label}</h3>
                    </div>
                    <button type="button" onClick={() => setSelected(null)} className="text-[var(--muted-foreground)]">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {selected.subtitle && <p className="text-sm text-[var(--muted-foreground)] mt-2">{selected.subtitle}</p>}
                  <dl className="mt-3 space-y-1 text-sm">
                    {Object.entries(selected.detail || {}).filter(([, v]) => v != null && v !== '').map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3">
                        <dt className="text-[var(--muted-foreground)]">{key}</dt>
                        <dd className="text-right break-all">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  {selected.kind === 'dashboard' && (
                    <Button size="sm" className="mt-3" onClick={() => navigate(`/space/${spaceId}/visuals`)}>
                      Open dashboard
                    </Button>
                  )}
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
