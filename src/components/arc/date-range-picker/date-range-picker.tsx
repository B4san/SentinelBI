import { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './date-range-picker.module.css';

export type DateRangePreset = 'last-30d' | 'qtd' | 'ytd' | 'last-12m' | 'custom';

export interface DateRangeValue {
  from: string;
  to: string;
  preset: DateRangePreset;
}

function iso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function rangeForPreset(
  preset: DateRangePreset,
  now = new Date(),
  bounds?: { min?: Date; max?: Date },
): { from: string; to: string } {
  const to = startOfDay(bounds?.max || now);
  if (preset === 'last-30d') {
    const from = new Date(to);
    from.setDate(from.getDate() - 29);
    return { from: iso(from), to: iso(to) };
  }
  if (preset === 'qtd') {
    const q = Math.floor(to.getMonth() / 3) * 3;
    return { from: iso(new Date(to.getFullYear(), q, 1)), to: iso(to) };
  }
  if (preset === 'ytd') {
    return { from: iso(new Date(to.getFullYear(), 0, 1)), to: iso(to) };
  }
  if (preset === 'last-12m') {
    const from = new Date(to.getFullYear(), to.getMonth() - 11, 1);
    return { from: iso(from), to: iso(to) };
  }
  return { from: '', to: '' };
}

function presetOverlapsData(preset: DateRangePreset, min?: Date, max?: Date): boolean {
  if (!min || !max) return true;
  const range = rangeForPreset(preset, max, { min, max });
  if (!range.from || !range.to) return true;
  return range.to >= iso(min) && range.from <= iso(max);
}

const PRESETS: Array<{ id: DateRangePreset; label: string }> = [
  { id: 'last-30d', label: 'Last 30d' },
  { id: 'qtd', label: 'QTD' },
  { id: 'ytd', label: 'YTD' },
  { id: 'last-12m', label: 'Last 12m' },
  { id: 'custom', label: 'Custom' },
];

function monthGrid(year: number, month: number): Array<{ iso: string; day: number; inMonth: boolean }> {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({
      iso: iso(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    });
  }
  return cells;
}

export function DateRangePicker({
  value,
  onChange,
  accent,
  muted,
  minDate,
  maxDate,
  hasDate,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  accent?: string;
  muted?: string;
  minDate?: Date;
  maxDate?: Date;
  hasDate?: (iso: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const anchor = maxDate || (value.to ? new Date(`${value.to}T00:00:00`) : new Date());
    return new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  });
  const [draft, setDraft] = useState<string | null>(null);
  const label = useMemo(() => {
    const preset = PRESETS.find((p) => p.id === value.preset);
    if (value.from && value.to) return `${value.from} → ${value.to}`;
    return preset?.label || 'Date range';
  }, [value]);

  const visible = PRESETS.filter((preset) => preset.id === 'custom' || presetOverlapsData(preset.id, minDate, maxDate));
  const months = [cursor, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)];

  const pickDay = (day: string) => {
    if (!draft || (value.from && value.to && !draft)) {
      setDraft(day);
      onChange({ from: day, to: '', preset: 'custom' });
      return;
    }
    const from = draft <= day ? draft : day;
    const to = draft <= day ? day : draft;
    setDraft(null);
    onChange({ from, to, preset: 'custom' });
  };

  const inRange = (day: string) => {
    if (!value.from) return false;
    if (!value.to) return day === value.from;
    return day >= value.from && day <= value.to;
  };

  return (
    <div className={styles.wrap} data-arc="date-range-picker">
      <button type="button" className={styles.trigger} onClick={() => setOpen((v) => !v)} style={{ color: muted }}>
        <CalendarRange size={14} />
        {label}
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Date range">
          <div className={styles.presets}>
            {visible.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={styles.preset}
                data-active={value.preset === preset.id}
                style={value.preset === preset.id ? { color: accent } : undefined}
                onClick={() => {
                  if (preset.id === 'custom') {
                    onChange({ ...value, preset: 'custom' });
                    return;
                  }
                  onChange({ preset: preset.id, ...rangeForPreset(preset.id, maxDate || new Date(), { min: minDate, max: maxDate }) });
                  setOpen(false);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className={styles.nav}>
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
              <ChevronLeft size={14} />
            </button>
            <span>{months.map((m) => m.toLocaleString('en', { month: 'short', year: 'numeric' })).join(' · ')}</span>
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
              <ChevronRight size={14} />
            </button>
          </div>
          <div className={styles.calendars}>
            {months.map((month) => (
              <div key={`${month.getFullYear()}-${month.getMonth()}`} className={styles.month}>
                <div className={styles.weekdays}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}
                </div>
                <div className={styles.days}>
                  {monthGrid(month.getFullYear(), month.getMonth()).map((cell) => {
                    const disabled = (minDate && cell.iso < iso(minDate)) || (maxDate && cell.iso > iso(maxDate)) || (hasDate && !hasDate(cell.iso) && !cell.inMonth);
                    const empty = hasDate ? !hasDate(cell.iso) : false;
                    return (
                      <button
                        key={cell.iso + cell.inMonth}
                        type="button"
                        disabled={disabled || (empty && !cell.inMonth)}
                        data-in-month={cell.inMonth}
                        data-selected={inRange(cell.iso)}
                        data-start={cell.iso === value.from}
                        data-end={cell.iso === value.to}
                        onClick={() => pickDay(cell.iso)}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
