import type { ChartType, GridPosition, LayoutArchetype, WidgetType } from './types';
import { LAYOUT_ARCHETYPES } from './types';

export interface ArchetypeSlot {
  type: WidgetType;
  layout: GridPosition;
  featured?: boolean;
  role?: 'hero' | 'support' | 'compare-a' | 'compare-b' | 'strip' | 'featured';
  prefer?: ChartType[];
}

export const ARCHETYPE_META: Record<LayoutArchetype, { label: string; brief: string }> = {
  'hero-kpi-rail': { label: 'Executive', brief: 'One oversized hero KPI, supporting metrics, then the operating trend.' },
  editorial: { label: 'Editorial', brief: 'Headline insight beside a hero chart — story first, metrics after.' },
  'command-center': { label: 'Analytical', brief: 'Chart-first workspace with a KPI sidebar and diagnostic views.' },
  'story-arc': { label: 'Story arc', brief: 'Sequential sections that walk from headline to detail.' },
  'split-insight': { label: 'Insight split', brief: 'Finding on the left, visuals stacked on the right.' },
  'metric-mosaic': { label: 'KPI wall', brief: 'Dense mosaic of varied card sizes, then one working chart.' },
  comparison: { label: 'Comparison', brief: 'Split A/B header and paired charts for side-by-side review.' },
  'funnel-flow': { label: 'Flow', brief: 'Full-width trend first, then three equal diagnostic charts.' },
};

function kpiRow(count: number, y: number, h = 2): ArchetypeSlot[] {
  const n = Math.max(1, Math.min(4, count));
  if (n === 1) return [{ type: 'kpi', layout: { x: 0, y, w: 12, h }, role: 'support' }];
  if (n === 2) {
    return [
      { type: 'kpi', layout: { x: 0, y, w: 6, h }, role: 'support' },
      { type: 'kpi', layout: { x: 6, y, w: 6, h }, role: 'support' },
    ];
  }
  if (n === 3) {
    return [
      { type: 'kpi', layout: { x: 0, y, w: 4, h }, role: 'support' },
      { type: 'kpi', layout: { x: 4, y, w: 4, h }, role: 'support' },
      { type: 'kpi', layout: { x: 8, y, w: 4, h }, role: 'support' },
    ];
  }
  return [
    { type: 'kpi', layout: { x: 0, y, w: 3, h }, role: 'support' },
    { type: 'kpi', layout: { x: 3, y, w: 3, h }, role: 'support' },
    { type: 'kpi', layout: { x: 6, y, w: 3, h }, role: 'support' },
    { type: 'kpi', layout: { x: 9, y, w: 3, h }, role: 'support' },
  ];
}

function executiveSlots(kpiCount: number): ArchetypeSlot[] {
  const n = Math.max(1, kpiCount);
  const opening: ArchetypeSlot[] = [];
  if (n === 1) {
    opening.push({ type: 'kpi', layout: { x: 0, y: 0, w: 12, h: 3 }, featured: true, role: 'hero' });
  } else if (n === 2) {
    opening.push(
      { type: 'kpi', layout: { x: 0, y: 0, w: 7, h: 4 }, featured: true, role: 'hero' },
      { type: 'kpi', layout: { x: 7, y: 0, w: 5, h: 4 }, role: 'support' },
    );
  } else if (n === 3) {
    opening.push(
      { type: 'kpi', layout: { x: 0, y: 0, w: 7, h: 4 }, featured: true, role: 'hero' },
      { type: 'kpi', layout: { x: 7, y: 0, w: 5, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 7, y: 2, w: 5, h: 2 }, role: 'support' },
    );
  } else {
    opening.push(
      { type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 4 }, featured: true, role: 'hero' },
      { type: 'kpi', layout: { x: 6, y: 0, w: 6, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 6, y: 2, w: 3, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 9, y: 2, w: 3, h: 2 }, role: 'support' },
    );
  }
  return [
    ...opening,
    { type: 'insight', layout: { x: 0, y: 4, w: 12, h: 2 }, role: 'strip' },
    { type: 'chart', layout: { x: 0, y: 6, w: 12, h: 6 }, featured: true, prefer: ['area', 'line'] },
    { type: 'chart', layout: { x: 0, y: 12, w: 6, h: 5 }, prefer: ['bar'] },
    { type: 'chart', layout: { x: 6, y: 12, w: 6, h: 5 }, prefer: ['donut', 'horizontal-bar'] },
  ];
}

function editorialSlots(kpiCount: number): ArchetypeSlot[] {
  const n = Math.max(0, kpiCount);
  const leftKpi = n > 0;
  const slots: ArchetypeSlot[] = [
    { type: 'section', layout: { x: 0, y: 0, w: 12, h: 2 } },
    { type: 'insight', layout: { x: 0, y: 2, w: 5, h: 2 }, featured: true, role: 'featured' },
    { type: 'chart', layout: { x: 5, y: 2, w: 7, h: 6 }, featured: true, prefer: ['area', 'bar'] },
  ];
  if (leftKpi) {
    slots.push({ type: 'kpi', layout: { x: 0, y: 4, w: 5, h: 4 }, role: 'hero' });
  }
  const remaining = Math.max(0, n - (leftKpi ? 1 : 0));
  if (remaining > 0) {
    slots.push(...kpiRow(Math.min(3, remaining), 8, 2));
  }
  const y = remaining > 0 ? 10 : 8;
  slots.push(
    { type: 'chart', layout: { x: 0, y, w: 6, h: 5 }, prefer: ['bar'] },
    { type: 'chart', layout: { x: 6, y, w: 6, h: 5 }, prefer: ['donut', 'bar'] },
  );
  return slots;
}

function analyticalSlots(kpiCount: number): ArchetypeSlot[] {
  const n = Math.max(1, Math.min(4, kpiCount));
  const slots: ArchetypeSlot[] = [
    { type: 'chart', layout: { x: 0, y: 0, w: 8, h: 7 }, featured: true, role: 'hero', prefer: ['line', 'area'] },
  ];
  if (n === 1) {
    slots.push({ type: 'kpi', layout: { x: 8, y: 0, w: 4, h: 7 }, role: 'support' });
  } else if (n === 2) {
    slots.push(
      { type: 'kpi', layout: { x: 8, y: 0, w: 4, h: 3 }, role: 'support' },
      { type: 'kpi', layout: { x: 8, y: 3, w: 4, h: 4 }, role: 'support' },
    );
  } else if (n === 3) {
    slots.push(
      { type: 'kpi', layout: { x: 8, y: 0, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 8, y: 2, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 8, y: 4, w: 4, h: 3 }, role: 'support' },
    );
  } else {
    slots.push(
      { type: 'kpi', layout: { x: 8, y: 0, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 8, y: 2, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 8, y: 4, w: 4, h: 3 }, role: 'support' },
    );
  }
  slots.push(
    { type: 'chart', layout: { x: 0, y: 7, w: 4, h: 5 }, prefer: ['donut'] },
    { type: 'chart', layout: { x: 4, y: 7, w: 8, h: 5 }, prefer: ['bar'] },
    { type: 'chart', layout: { x: 0, y: 12, w: 12, h: 5 }, prefer: ['horizontal-bar'] },
    { type: 'table', layout: { x: 0, y: 17, w: 12, h: 4 } },
  );
  return slots;
}

function mosaicSlots(kpiCount: number): ArchetypeSlot[] {
  const n = Math.max(2, Math.min(8, kpiCount));
  const slots: ArchetypeSlot[] = [];
  if (n <= 3) {
    slots.push(
      { type: 'kpi', layout: { x: 0, y: 0, w: 8, h: 3 }, role: 'hero' },
      { type: 'kpi', layout: { x: 8, y: 0, w: 4, h: 3 }, role: 'support' },
    );
    if (n === 3) slots.push({ type: 'kpi', layout: { x: 0, y: 3, w: 12, h: 2 }, role: 'support' });
  } else if (n === 4) {
    slots.push(
      { type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 3 }, role: 'hero' },
      { type: 'kpi', layout: { x: 6, y: 0, w: 6, h: 3 }, role: 'support' },
      { type: 'kpi', layout: { x: 0, y: 3, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 4, y: 3, w: 8, h: 2 }, role: 'support' },
    );
  } else if (n === 5) {
    slots.push(
      { type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 3 }, role: 'hero' },
      { type: 'kpi', layout: { x: 6, y: 0, w: 3, h: 3 }, role: 'support' },
      { type: 'kpi', layout: { x: 9, y: 0, w: 3, h: 3 }, role: 'support' },
      { type: 'kpi', layout: { x: 0, y: 3, w: 5, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 5, y: 3, w: 7, h: 2 }, role: 'support' },
    );
  } else if (n === 6) {
    slots.push(
      { type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 3 }, role: 'hero' },
      { type: 'kpi', layout: { x: 6, y: 0, w: 3, h: 3 }, role: 'support' },
      { type: 'kpi', layout: { x: 9, y: 0, w: 3, h: 3 }, role: 'support' },
      { type: 'kpi', layout: { x: 0, y: 3, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 4, y: 3, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 8, y: 3, w: 4, h: 2 }, role: 'support' },
    );
  } else if (n === 7) {
    slots.push(
      { type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 3 }, role: 'hero' },
      { type: 'kpi', layout: { x: 6, y: 0, w: 6, h: 3 }, role: 'support' },
      { type: 'kpi', layout: { x: 0, y: 3, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 4, y: 3, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 8, y: 3, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 0, y: 5, w: 6, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 6, y: 5, w: 6, h: 2 }, role: 'support' },
    );
  } else {
    slots.push(
      { type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 3 }, role: 'hero' },
      { type: 'kpi', layout: { x: 6, y: 0, w: 3, h: 3 }, role: 'support' },
      { type: 'kpi', layout: { x: 9, y: 0, w: 3, h: 3 }, role: 'support' },
      { type: 'kpi', layout: { x: 0, y: 3, w: 3, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 3, y: 3, w: 3, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 6, y: 3, w: 6, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 0, y: 5, w: 4, h: 2 }, role: 'support' },
      { type: 'kpi', layout: { x: 4, y: 5, w: 8, h: 2 }, role: 'support' },
    );
  }
  const after = Math.max(...slots.map((s) => s.layout.y + s.layout.h));
  slots.push(
    { type: 'chart', layout: { x: 0, y: after, w: 12, h: 5 }, featured: true, prefer: ['area', 'bar'] },
    { type: 'insight', layout: { x: 0, y: after + 5, w: 12, h: 2 }, role: 'strip' },
  );
  return slots;
}

function comparisonSlots(kpiCount: number): ArchetypeSlot[] {
  const extra = Math.max(0, kpiCount - 2);
  const slots: ArchetypeSlot[] = [
    { type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 3 }, role: 'compare-a' },
    { type: 'kpi', layout: { x: 6, y: 0, w: 6, h: 3 }, role: 'compare-b' },
    { type: 'chart', layout: { x: 0, y: 3, w: 6, h: 5 }, featured: true, role: 'compare-a', prefer: ['bar'] },
    { type: 'chart', layout: { x: 6, y: 3, w: 6, h: 5 }, featured: true, role: 'compare-b', prefer: ['bar'] },
    { type: 'insight', layout: { x: 0, y: 8, w: 12, h: 2 }, role: 'strip' },
  ];
  if (extra > 0) slots.push(...kpiRow(Math.min(2, extra), 10, 2));
  return slots;
}

function storyArcSlots(kpiCount: number): ArchetypeSlot[] {
  return [
    { type: 'section', layout: { x: 0, y: 0, w: 12, h: 2 } },
    { type: 'chart', layout: { x: 0, y: 2, w: 12, h: 6 }, featured: true, prefer: ['area', 'line'] },
    { type: 'insight', layout: { x: 0, y: 8, w: 12, h: 2 }, role: 'strip' },
    ...kpiRow(Math.min(3, Math.max(1, kpiCount)), 10, 2),
    { type: 'table', layout: { x: 0, y: 12, w: 12, h: 4 } },
  ];
}

function splitSlots(kpiCount: number): ArchetypeSlot[] {
  const n = Math.max(1, Math.min(3, kpiCount));
  const slots: ArchetypeSlot[] = [
    { type: 'insight', layout: { x: 0, y: 0, w: 4, h: 4 }, featured: true, role: 'featured' },
    { type: 'chart', layout: { x: 4, y: 0, w: 8, h: 4 }, featured: true, prefer: ['bar', 'area'] },
  ];
  slots.push(...kpiRow(n, 4, 2));
  slots.push({ type: 'chart', layout: { x: 0, y: 6, w: 12, h: 5 }, prefer: ['line', 'bar'] });
  return slots;
}

function funnelSlots(kpiCount: number): ArchetypeSlot[] {
  return [
    { type: 'chart', layout: { x: 0, y: 0, w: 12, h: 6 }, featured: true, role: 'hero', prefer: ['area', 'line'] },
    { type: 'chart', layout: { x: 0, y: 6, w: 4, h: 5 }, prefer: ['bar'] },
    { type: 'chart', layout: { x: 4, y: 6, w: 4, h: 5 }, prefer: ['donut'] },
    { type: 'chart', layout: { x: 8, y: 6, w: 4, h: 5 }, prefer: ['horizontal-bar'] },
    ...kpiRow(Math.min(3, Math.max(1, kpiCount)), 11, 2),
  ];
}

export function slotsForArchetype(archetype: LayoutArchetype, kpiCount: number): ArchetypeSlot[] {
  const n = Math.max(1, kpiCount);
  switch (archetype) {
    case 'hero-kpi-rail':
      return executiveSlots(n);
    case 'editorial':
      return editorialSlots(n);
    case 'command-center':
      return analyticalSlots(n);
    case 'metric-mosaic':
      return mosaicSlots(n);
    case 'comparison':
      return comparisonSlots(n);
    case 'story-arc':
      return storyArcSlots(n);
    case 'split-insight':
      return splitSlots(n);
    case 'funnel-flow':
      return funnelSlots(n);
    default:
      return executiveSlots(n);
  }
}

export const ARCHETYPE_SLOTS: Record<LayoutArchetype, ArchetypeSlot[]> = LAYOUT_ARCHETYPES.reduce(
  (acc, archetype) => {
    acc[archetype] = slotsForArchetype(archetype, 8);
    return acc;
  },
  {} as Record<LayoutArchetype, ArchetypeSlot[]>,
);

export const DESIGN_PRINCIPLES = [
  'Fill the 12-column grid edge to edge. Every row must sum to width 12. Chart height must fill the card; card height must fit its content.',
  'Each archetype MUST open with a distinct hero — never the same 4 equal KPI tiles. Executive: one oversized hero KPI + supporting metrics. Editorial: headline insight + one hero chart. Analytical: chart-first with a KPI sidebar. KPI wall: dense mosaic of varied card sizes. Comparison: split A/B header.',
  'Do not create a dark island on a light page. Match the app mode; keep the board background transparent.',
  'Never emit filler / meta KPIs (rows loaded, number of channels, number of devices, unique counts of dimensions). If there are few real measures, use fewer, larger cards.',
  'KPI polarity: higher-is-better (revenue, conversions) vs lower-is-better (bounce, churn, cost, CAC, latency, errors, refunds). An increase on a lower-is-better metric is red; a decrease is green.',
  'One idea per widget. Adjacent charts must use different types. Time fields encode as line/area, sorted chronologically. Categories encode as bar/donut. Never treat a date as a “leader”.',
  'KPI values and insight copy must be computed from the data: totals, shares, period % change, top/bottom cohorts, outliers, correlations.',
  'Insight sentences are grammatical and specific: “APAC generated $75.4K in revenue, 19% of the total.” Forbidden: “2026-09-08 leads Date with 1 observations”. Featured insight cards stay short (h=3–5), never a tall empty column.',
];
