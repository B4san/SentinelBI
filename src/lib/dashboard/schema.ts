import { z } from 'zod';
import { COMPONENT_CATALOG } from './catalog';
import { LAYOUT_ARCHETYPES, MEASURE_FORMATS } from './types';

const measureRef = z.object({
  field: z.string(),
  agg: z.enum(['sum', 'avg', 'count', 'min', 'max']).optional(),
});

export const derivedMeasureSchema = z.object({
  kind: z.enum(['ratio', 'difference', 'margin', 'weighted']),
  numerator: measureRef,
  denominator: measureRef,
  format: z.enum(MEASURE_FORMATS).optional(),
});

const simpleMeasureSchema = measureRef.extend({
  kind: z.literal('simple').optional(),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max']).optional(),
  format: z.enum(MEASURE_FORMATS).optional(),
});

export const widgetMeasureSchema = z.union([derivedMeasureSchema, simpleMeasureSchema]);

export const widgetSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['kpi', 'chart', 'insight', 'table', 'section']),
  title: z.string().optional(),
  componentId: z.string().optional(),
  xField: z.string().optional(),
  yField: z.string().optional(),
  measure: widgetMeasureSchema.optional(),
  series: z.array(z.object({
    field: z.string(),
    label: z.string().optional(),
    style: z.enum(['line', 'bar', 'area', 'dashed', 'target']).optional(),
    axis: z.enum(['left', 'right']).optional(),
  })).optional(),
  table: z.object({
    sort: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']) }).optional(),
    limit: z.number().optional(),
    groupBy: z.array(z.string()).optional(),
  }).optional(),
}).passthrough();

export const dashboardSpecSchema = z.object({
  version: z.number().optional(),
  title: z.string().optional(),
  archetype: z.enum(LAYOUT_ARCHETYPES).optional(),
  widgets: z.array(widgetSchema).default([]),
}).passthrough();

export const DASHBOARD_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    version: { type: 'number' },
    title: { type: 'string' },
    archetype: { type: 'string', enum: [...LAYOUT_ARCHETYPES] },
    widgets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          type: { type: 'string' },
          componentId: { type: 'string', enum: COMPONENT_CATALOG.map((c) => c.id) },
          title: { type: 'string' },
        },
      },
    },
  },
};
