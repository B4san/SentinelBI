import { formatLocalDate, parseLocalDate, startOfGrain, toLocalISODate } from './dates';
import { aggregateNumber } from './format';
import type { Aggregation } from './types';

export type TimeGrain = 'day' | 'week' | 'month' | 'quarter';

export function autoTimeGrain(values: unknown[]): TimeGrain {
  const dates = values.map(parseLocalDate).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime());
  if (dates.length < 2) return 'day';
  const spanDays = Math.max(1, Math.round((dates[dates.length - 1].getTime() - dates[0].getTime()) / 86_400_000));
  if (spanDays <= 45) return 'day';
  if (spanDays <= 26 * 7) return 'week';
  if (spanDays <= 36 * 31) return 'month';
  return 'quarter';
}

export function grainSpanDays(grain: TimeGrain): number {
  if (grain === 'day') return 1;
  if (grain === 'week') return 7;
  if (grain === 'month') return 28;
  return 80;
}

export function isPartialBucket(date: Date, grain: TimeGrain, dataEnd: Date): boolean {
  const start = startOfGrain(date, grain);
  const end = new Date(start);
  if (grain === 'day') return false;
  if (grain === 'week') end.setDate(end.getDate() + 6);
  else if (grain === 'month') end.setMonth(end.getMonth() + 1, 0);
  else end.setMonth(end.getMonth() + 3, 0);
  return end.getTime() > dataEnd.getTime();
}

export function bucketTimeSeries(
  rows: Record<string, unknown>[],
  timeField: string,
  measureField: string,
  aggregation: Aggregation = 'sum',
  grain?: TimeGrain,
  opts: { keepPartial?: boolean } = {},
): Array<{ key: string; label: string; value: number; date: Date; partial?: boolean }> {
  const dated = rows
    .map((row) => ({ date: parseLocalDate(row[timeField]), value: Number(row[measureField]) }))
    .filter((row) => row.date && !Number.isNaN(row.value)) as Array<{ date: Date; value: number }>;
  const resolved = grain || autoTimeGrain(dated.map((row) => row.date));
  const groups = new Map<string, number[]>();
  const order: string[] = [];
  for (const row of dated) {
    const start = startOfGrain(row.date, resolved);
    const key = toLocalISODate(start);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(row.value);
  }
  order.sort();
  const dataEnd = dated.reduce((max, row) => (row.date > max ? row.date : max), dated[0]?.date || new Date());
  const buckets = order.map((key) => {
    const date = parseLocalDate(key)!;
    const partial = isPartialBucket(date, resolved, dataEnd);
    return {
      key,
      label: formatLocalDate(date, resolved),
      value: Number(aggregateNumber(groups.get(key) || [], aggregation).toFixed(4)),
      date,
      partial,
    };
  });
  if (opts.keepPartial) return buckets;
  const complete = buckets.filter((b) => !b.partial);
  return complete.length ? complete : buckets;
}
