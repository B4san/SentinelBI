import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
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

export function rangeForPreset(preset: DateRangePreset, now = new Date()): { from: string; to: string } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

const PRESETS: Array<{ id: DateRangePreset; label: string }> = [
  { id: 'last-30d', label: 'Last 30d' },
  { id: 'qtd', label: 'QTD' },
  { id: 'ytd', label: 'YTD' },
  { id: 'last-12m', label: 'Last 12m' },
  { id: 'custom', label: 'Custom' },
];

export function DateRangePicker({
  value,
  onChange,
  accent,
  muted,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  accent?: string;
  muted?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => {
    const preset = PRESETS.find((p) => p.id === value.preset);
    if (value.from && value.to) return `${value.from} → ${value.to}`;
    return preset?.label || 'Date range';
  }, [value]);

  return (
    <div className={styles.wrap} data-arc="date-range-picker">
      <button type="button" className={styles.trigger} onClick={() => setOpen((v) => !v)} style={{ color: muted }}>
        <CalendarRange size={14} />
        {label}
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Date range">
          <div className={styles.presets}>
            {PRESETS.map((preset) => (
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
                  onChange({ preset: preset.id, ...rangeForPreset(preset.id) });
                  setOpen(false);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className={styles.fields}>
            <label>
              From
              <input
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={value.from}
                onChange={(e) => onChange({ from: e.target.value, to: value.to, preset: 'custom' })}
              />
            </label>
            <label>
              To
              <input
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={value.to}
                onChange={(e) => onChange({ from: value.from, to: e.target.value, preset: 'custom' })}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
