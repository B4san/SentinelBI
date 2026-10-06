import { describe, expect, it } from 'vitest';
import { createSampleSpace } from '../src/lib/sampleData';
import { buildTopology, layoutTopology } from '../src/lib/topology/buildTopology';
import { DEFAULT_AI_SETTINGS } from '../src/lib/ai/client';
import type { Space } from '../src/store';

function emptySpace(): Space {
  const sample = createSampleSpace('sales');
  return {
    ...sample,
    uploadedFiles: [],
    parsedData: [],
    datasets: [],
    columns: [],
    savedDashboards: [],
    dashboardSpec: undefined,
    chatMessages: [],
    generatedCode: '',
  };
}

describe('buildTopology', () => {
  it('returns an empty graph when the space has no data', () => {
    const graph = buildTopology(emptySpace(), DEFAULT_AI_SETTINGS, { ok: true, provider: 'openrouter', model: 'openrouter/free' });
    expect(graph.empty).toBe(true);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it('builds source, dataset, provider and dashboard nodes from real space state', () => {
    const space = createSampleSpace('sales');
    space.dashboardSpec = {
      version: 1,
      id: 'dash-1',
      title: 'Revenue board',
      archetype: 'command-center',
      seed: 1,
      theme: { palette: { id: 'p', label: 'p', mode: 'light', background: '#fff', surface: '#fff', text: '#000', muted: '#999', accent: '#00f', accentSoft: '#eef', border: '#ddd', chart: [] }, fontFamily: 'Inter', radius: '8px', density: 'comfortable' },
      sections: [],
      widgets: [{ id: 'w1' } as never],
      generatedBy: 'openrouter/free',
    };
    space.generationRuns = [{
      at: new Date().toISOString(),
      source: 'fallback',
      model: 'openrouter/free',
      provider: 'openrouter',
      keySource: 'user',
      fallbackReason: 'timed out after 12s',
      attempts: [
        { step: 'json_object', status: 200, ms: 900, model: 'openrouter/free', keySource: 'user' },
        { step: 'plain', status: 504, ms: 12000, error: 'timed out', model: 'openrouter/free' },
      ],
    }];
    space.chatMessages = [{ id: 'm1', role: 'user', content: 'Why did revenue drop?', timestamp: new Date().toISOString() }];

    const graph = layoutTopology(buildTopology(space, { ...DEFAULT_AI_SETTINGS, provider: 'openrouter', model: 'openrouter/free', apiKey: 'user' }, {
      ok: true,
      provider: 'openrouter',
      model: 'openrouter/free',
      hasServerKey: true,
    }));

    expect(graph.empty).toBe(false);
    expect(graph.nodes.some((n) => n.kind === 'source' && n.label.includes('sales.csv'))).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'dataset')).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'ai' && /openrouter/.test(n.label))).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'ai' && n.subtitle === 'your key')).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'step')).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'fallback')).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'dashboard' && n.label === 'Revenue board')).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'chat')).toBe(true);
    expect(graph.nodes.every((n) => n.position)).toBe(true);
    expect(graph.edges.every((e) => ['ok', 'fallback', 'error', 'idle', 'running'].includes(e.status))).toBe(true);
    expect(graph.nodes.some((n) => n.id === 'intake' || n.label === 'Intake Agent')).toBe(false);
  });
});
