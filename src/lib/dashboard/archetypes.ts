import type { ChartType, GridPosition, LayoutArchetype, WidgetType } from './types';

export interface ArchetypeSlot {
  type: WidgetType;
  layout: GridPosition;
  featured?: boolean;
  role?: 'hero' | 'support' | 'compare-a' | 'compare-b' | 'strip';
  prefer?: ChartType[];
}

export const ARCHETYPE_META: Record<LayoutArchetype, { label: string; brief: string }> = {
  'hero-kpi-rail': { label: 'Executive', brief: 'Compact KPI strip, one hero trend, two supporting views.' },
  editorial: { label: 'Editorial', brief: 'Story-led briefing with a featured finding beside a hero chart.' },
  'command-center': { label: 'Analytical', brief: 'Dense deep-dive: more charts, a table, tighter KPIs.' },
  'story-arc': { label: 'Story arc', brief: 'Sequential sections that walk from headline to detail.' },
  'split-insight': { label: 'Insight split', brief: 'Findings rail on the left, visuals on the right.' },
  'metric-mosaic': { label: 'KPI wall', brief: 'Eight compact metrics plus one working chart.' },
  comparison: { label: 'Comparison', brief: 'Two equal charts and paired KPIs for side-by-side review.' },
  'funnel-flow': { label: 'Flow', brief: 'Full-width trend, then three equal diagnostic charts.' },
};

export const ARCHETYPE_SLOTS: Record<LayoutArchetype, ArchetypeSlot[]> = {
  'hero-kpi-rail': [
    { type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 3, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 6, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 9, y: 0, w: 3, h: 2 } },
    { type: 'insight', layout: { x: 0, y: 2, w: 12, h: 2 }, role: 'strip' },
    { type: 'chart', layout: { x: 0, y: 4, w: 12, h: 6 }, featured: true, prefer: ['area', 'line'] },
    { type: 'chart', layout: { x: 0, y: 10, w: 6, h: 5 }, prefer: ['bar'] },
    { type: 'chart', layout: { x: 6, y: 10, w: 6, h: 5 }, prefer: ['donut', 'horizontal-bar'] },
  ],
  editorial: [
    { type: 'section', layout: { x: 0, y: 0, w: 12, h: 2 } },
    { type: 'insight', layout: { x: 0, y: 2, w: 4, h: 7 }, featured: true },
    { type: 'chart', layout: { x: 4, y: 2, w: 8, h: 7 }, featured: true, prefer: ['area', 'bar'] },
    { type: 'kpi', layout: { x: 0, y: 9, w: 4, h: 2 } },
    { type: 'kpi', layout: { x: 4, y: 9, w: 4, h: 2 } },
    { type: 'kpi', layout: { x: 8, y: 9, w: 4, h: 2 } },
    { type: 'chart', layout: { x: 0, y: 11, w: 12, h: 5 }, prefer: ['horizontal-bar', 'bar'] },
  ],
  'command-center': [
    { type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 3, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 6, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 9, y: 0, w: 3, h: 2 } },
    { type: 'chart', layout: { x: 0, y: 2, w: 8, h: 6 }, featured: true, prefer: ['line', 'area'] },
    { type: 'chart', layout: { x: 8, y: 2, w: 4, h: 6 }, prefer: ['donut'] },
    { type: 'chart', layout: { x: 0, y: 8, w: 4, h: 5 }, prefer: ['horizontal-bar'] },
    { type: 'chart', layout: { x: 4, y: 8, w: 8, h: 5 }, prefer: ['bar'] },
    { type: 'table', layout: { x: 0, y: 13, w: 12, h: 4 } },
  ],
  'story-arc': [
    { type: 'section', layout: { x: 0, y: 0, w: 12, h: 2 } },
    { type: 'kpi', layout: { x: 0, y: 2, w: 4, h: 2 } },
    { type: 'kpi', layout: { x: 4, y: 2, w: 4, h: 2 } },
    { type: 'kpi', layout: { x: 8, y: 2, w: 4, h: 2 } },
    { type: 'chart', layout: { x: 0, y: 4, w: 12, h: 6 }, featured: true, prefer: ['area', 'line'] },
    { type: 'insight', layout: { x: 0, y: 10, w: 12, h: 2 }, role: 'strip' },
    { type: 'table', layout: { x: 0, y: 12, w: 12, h: 4 } },
  ],
  'split-insight': [
    { type: 'insight', layout: { x: 0, y: 0, w: 4, h: 10 }, featured: true },
    { type: 'kpi', layout: { x: 4, y: 0, w: 4, h: 2 } },
    { type: 'kpi', layout: { x: 8, y: 0, w: 4, h: 2 } },
    { type: 'chart', layout: { x: 4, y: 2, w: 8, h: 6 }, featured: true, prefer: ['bar', 'area'] },
    { type: 'chart', layout: { x: 4, y: 8, w: 8, h: 5 }, prefer: ['line', 'horizontal-bar'] },
  ],
  'metric-mosaic': [
    { type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 3, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 6, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 9, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 0, y: 2, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 3, y: 2, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 6, y: 2, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 9, y: 2, w: 3, h: 2 } },
    { type: 'chart', layout: { x: 0, y: 4, w: 8, h: 6 }, featured: true, prefer: ['bar', 'area'] },
    { type: 'insight', layout: { x: 8, y: 4, w: 4, h: 6 } },
  ],
  comparison: [
    { type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 3, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 6, y: 0, w: 3, h: 2 } },
    { type: 'kpi', layout: { x: 9, y: 0, w: 3, h: 2 } },
    { type: 'chart', layout: { x: 0, y: 2, w: 6, h: 7 }, featured: true, role: 'compare-a', prefer: ['bar'] },
    { type: 'chart', layout: { x: 6, y: 2, w: 6, h: 7 }, featured: true, role: 'compare-b', prefer: ['bar', 'horizontal-bar'] },
    { type: 'insight', layout: { x: 0, y: 9, w: 12, h: 2 }, role: 'strip' },
  ],
  'funnel-flow': [
    { type: 'kpi', layout: { x: 0, y: 0, w: 4, h: 2 } },
    { type: 'kpi', layout: { x: 4, y: 0, w: 4, h: 2 } },
    { type: 'kpi', layout: { x: 8, y: 0, w: 4, h: 2 } },
    { type: 'chart', layout: { x: 0, y: 2, w: 12, h: 6 }, featured: true, prefer: ['area', 'line'] },
    { type: 'chart', layout: { x: 0, y: 8, w: 4, h: 5 }, prefer: ['bar'] },
    { type: 'chart', layout: { x: 4, y: 8, w: 4, h: 5 }, prefer: ['donut'] },
    { type: 'chart', layout: { x: 8, y: 8, w: 4, h: 5 }, prefer: ['horizontal-bar'] },
  ],
};

export const DESIGN_PRINCIPLES = [
  'Fill the 12-column grid edge to edge. Every row must sum to width 12. KPI tiles are compact (h=2). Charts are h=5–7 with visible axes, labels, tooltips, and legends.',
  'Do not create a dark island on a light page. Match the app mode; keep the board background transparent.',
  'One idea per widget. Adjacent charts must use different types. Archetypes must be visually distinct.',
  'Time fields encode as line/area, sorted chronologically. Categories encode as bar/donut. Never treat a date as a “leader”.',
  'KPI values and insight copy must be computed from the data: totals, shares, period % change, top/bottom cohorts, outliers, correlations.',
  'Insight sentences are grammatical and specific: “APAC generated $75.4K in revenue, 19% of the total.” Forbidden: “2026-09-08 leads Date with 1 observations”.',
];
