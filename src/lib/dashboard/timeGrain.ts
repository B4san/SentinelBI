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

export function bucketTimeSeries(
  rows: Record<string, unknown>[],
  timeField: string,
  measureField: string,
  aggregation: Aggregation = 'sum',
  grain?: TimeGrain,
): Array<{ key: string; label: string; value: number; date: Date }> {
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
  return order.map((key) => {
    const date = parseLocalDate(key)!;
    return {
      key,
      label: formatLocalDate(date, resolved),
      value: Number(aggregateNumber(groups.get(key) || [], aggregation).toFixed(4)),
      date,
    };
  });
}
