import type { GridPosition, LayoutArchetype, WidgetType } from './types';

export interface ArchetypeSlot {
  type: WidgetType;
  layout: GridPosition;
  featured?: boolean;
}

export const ARCHETYPE_SLOTS: Record<LayoutArchetype, ArchetypeSlot[]> = {
  'hero-kpi-rail': [
    { type: 'kpi', layout: { x: 0, y: 0, w: 5, h: 4 }, featured: true },
    { type: 'kpi', layout: { x: 5, y: 0, w: 3, h: 4 } },
    { type: 'kpi', layout: { x: 8, y: 0, w: 4, h: 4 } },
    { type: 'chart', layout: { x: 0, y: 4, w: 8, h: 7 }, featured: true },
    { type: 'insight', layout: { x: 8, y: 4, w: 4, h: 7 } },
    { type: 'chart', layout: { x: 0, y: 11, w: 6, h: 6 } },
    { type: 'chart', layout: { x: 6, y: 11, w: 6, h: 6 } },
  ],
  editorial: [
    { type: 'insight', layout: { x: 0, y: 0, w: 12, h: 3 }, featured: true },
    { type: 'kpi', layout: { x: 0, y: 3, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 3, y: 3, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 6, y: 3, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 9, y: 3, w: 3, h: 3 } },
    { type: 'chart', layout: { x: 0, y: 6, w: 12, h: 7 }, featured: true },
    { type: 'chart', layout: { x: 0, y: 13, w: 6, h: 6 } },
    { type: 'chart', layout: { x: 6, y: 13, w: 6, h: 6 } },
  ],
  'command-center': [
    { type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 3, y: 0, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 6, y: 0, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 9, y: 0, w: 3, h: 3 } },
    { type: 'chart', layout: { x: 0, y: 3, w: 8, h: 6 }, featured: true },
    { type: 'chart', layout: { x: 8, y: 3, w: 4, h: 6 } },
    { type: 'chart', layout: { x: 0, y: 9, w: 4, h: 6 } },
    { type: 'chart', layout: { x: 4, y: 9, w: 8, h: 6 } },
  ],
  'story-arc': [
    { type: 'section', layout: { x: 0, y: 0, w: 12, h: 2 } },
    { type: 'kpi', layout: { x: 0, y: 2, w: 4, h: 3 } },
    { type: 'kpi', layout: { x: 4, y: 2, w: 4, h: 3 } },
    { type: 'kpi', layout: { x: 8, y: 2, w: 4, h: 3 } },
    { type: 'insight', layout: { x: 0, y: 5, w: 12, h: 3 } },
    { type: 'chart', layout: { x: 0, y: 8, w: 7, h: 7 }, featured: true },
    { type: 'chart', layout: { x: 7, y: 8, w: 5, h: 7 } },
    { type: 'table', layout: { x: 0, y: 15, w: 12, h: 6 } },
  ],
  'split-insight': [
    { type: 'insight', layout: { x: 0, y: 0, w: 4, h: 10 }, featured: true },
    { type: 'kpi', layout: { x: 4, y: 0, w: 4, h: 3 } },
    { type: 'kpi', layout: { x: 8, y: 0, w: 4, h: 3 } },
    { type: 'chart', layout: { x: 4, y: 3, w: 8, h: 7 }, featured: true },
    { type: 'chart', layout: { x: 0, y: 10, w: 6, h: 6 } },
    { type: 'chart', layout: { x: 6, y: 10, w: 6, h: 6 } },
  ],
  'metric-mosaic': [
    { type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 3, y: 0, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 6, y: 0, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 9, y: 0, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 0, y: 3, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 3, y: 3, w: 3, h: 3 } },
    { type: 'chart', layout: { x: 6, y: 3, w: 6, h: 9 }, featured: true },
    { type: 'chart', layout: { x: 0, y: 6, w: 6, h: 6 } },
    { type: 'insight', layout: { x: 0, y: 12, w: 12, h: 3 } },
  ],
  comparison: [
    { type: 'insight', layout: { x: 0, y: 0, w: 12, h: 3 } },
    { type: 'chart', layout: { x: 0, y: 3, w: 6, h: 8 }, featured: true },
    { type: 'chart', layout: { x: 6, y: 3, w: 6, h: 8 }, featured: true },
    { type: 'kpi', layout: { x: 0, y: 11, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 3, y: 11, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 6, y: 11, w: 3, h: 3 } },
    { type: 'kpi', layout: { x: 9, y: 11, w: 3, h: 3 } },
  ],
  'funnel-flow': [
    { type: 'kpi', layout: { x: 0, y: 0, w: 12, h: 3 }, featured: true },
    { type: 'chart', layout: { x: 0, y: 3, w: 12, h: 6 }, featured: true },
    { type: 'chart', layout: { x: 0, y: 9, w: 4, h: 6 } },
    { type: 'chart', layout: { x: 4, y: 9, w: 4, h: 6 } },
    { type: 'chart', layout: { x: 8, y: 9, w: 4, h: 6 } },
    { type: 'insight', layout: { x: 0, y: 15, w: 12, h: 3 } },
  ],
};

export const DESIGN_PRINCIPLES = [
  'One visual idea per widget. Never repeat the same chart type in adjacent slots.',
  'Lead with the decision the viewer must make, not a generic "Overview" title.',
  'KPIs must use computed totals/averages from the data summaries, never placeholders.',
  'Pick chart types from the data: time → line/area, composition → donut/treemap, comparison → bar, correlation → scatter, hierarchy → pack/tree.',
  'Leave breathing room: mix wide hero charts with compact supporting tiles.',
  'Narrative insight cards should state a finding, not describe the chart type.',
];
