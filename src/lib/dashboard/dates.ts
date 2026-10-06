const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

export function parseLocalDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = raw.match(ISO_DAY);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    const date = new Date(year, month, day);
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function toLocalISODate(value: unknown): string {
  const date = parseLocalDate(value);
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatLocalDate(value: unknown, grain: 'day' | 'week' | 'month' | 'quarter' = 'day'): string {
  const date = parseLocalDate(value);
  if (!date) return String(value ?? '');
  if (grain === 'quarter') {
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  }
  if (grain === 'month') {
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  if (grain === 'week') {
    return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function startOfGrain(date: Date, grain: 'day' | 'week' | 'month' | 'quarter'): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (grain === 'day') return next;
  if (grain === 'week') {
    const day = next.getDay();
    next.setDate(next.getDate() - day);
    return next;
  }
  if (grain === 'month') return new Date(next.getFullYear(), next.getMonth(), 1);
  const quarter = Math.floor(next.getMonth() / 3) * 3;
  return new Date(next.getFullYear(), quarter, 1);
}
