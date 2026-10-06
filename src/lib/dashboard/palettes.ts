import type { Palette } from './types';

export const PALETTES: Palette[] = [
  {
    id: 'ocean',
    label: 'Ocean',
    mode: 'light',
    background: 'transparent',
    surface: '#ffffff',
    text: '#0f172a',
    muted: '#64748b',
    accent: '#2563eb',
    accentSoft: '#dbeafe',
    border: '#e2e8f0',
    chart: ['#2563eb', '#0ea5e9', '#14b8a6', '#7c3aed', '#f59e0b', '#ef4444'],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    mode: 'light',
    background: 'transparent',
    surface: '#ffffff',
    text: '#1c1917',
    muted: '#78716c',
    accent: '#ea580c',
    accentSoft: '#ffedd5',
    border: '#e7e5e4',
    chart: ['#ea580c', '#e11d48', '#d97706', '#7c3aed', '#0284c7', '#059669'],
  },
  {
    id: 'forest',
    label: 'Forest',
    mode: 'light',
    background: 'transparent',
    surface: '#ffffff',
    text: '#14532d',
    muted: '#4d7c5a',
    accent: '#059669',
    accentSoft: '#d1fae5',
    border: '#dce8df',
    chart: ['#059669', '#0d9488', '#65a30d', '#2563eb', '#d97706', '#be123c'],
  },
  {
    id: 'violet',
    label: 'Violet',
    mode: 'light',
    background: 'transparent',
    surface: '#ffffff',
    text: '#1e1b4b',
    muted: '#6b7280',
    accent: '#7c3aed',
    accentSoft: '#ede9fe',
    border: '#e4e4f0',
    chart: ['#7c3aed', '#2563eb', '#db2777', '#0891b2', '#d97706', '#16a34a'],
  },
  {
    id: 'slate',
    label: 'Slate',
    mode: 'light',
    background: 'transparent',
    surface: '#ffffff',
    text: '#0f172a',
    muted: '#64748b',
    accent: '#334155',
    accentSoft: '#e2e8f0',
    border: '#e2e8f0',
    chart: ['#334155', '#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c'],
  },
  {
    id: 'ice',
    label: 'Ice',
    mode: 'light',
    background: 'transparent',
    surface: '#ffffff',
    text: '#164e63',
    muted: '#578392',
    accent: '#0891b2',
    accentSoft: '#cffafe',
    border: '#d7e8ee',
    chart: ['#0891b2', '#2563eb', '#7c3aed', '#059669', '#d97706', '#e11d48'],
  },
  {
    id: 'midnight',
    label: 'Midnight',
    mode: 'dark',
    background: 'transparent',
    surface: '#141c2e',
    text: '#e8eef7',
    muted: '#94a3b8',
    accent: '#60a5fa',
    accentSoft: '#1e3a5f',
    border: '#243049',
    chart: ['#60a5fa', '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185'],
  },
  {
    id: 'aurora',
    label: 'Aurora',
    mode: 'dark',
    background: 'transparent',
    surface: '#12231d',
    text: '#e7fff6',
    muted: '#8ab5a8',
    accent: '#34d399',
    accentSoft: '#14532d',
    border: '#1c3b32',
    chart: ['#34d399', '#22d3ee', '#60a5fa', '#fbbf24', '#f472b6', '#c084fc'],
  },
  {
    id: 'ember',
    label: 'Ember',
    mode: 'dark',
    background: 'transparent',
    surface: '#1c1412',
    text: '#fde7dc',
    muted: '#c4a394',
    accent: '#fb923c',
    accentSoft: '#431407',
    border: '#3f2a22',
    chart: ['#fb923c', '#f472b6', '#fbbf24', '#60a5fa', '#34d399', '#c084fc'],
  },
  {
    id: 'orchid',
    label: 'Orchid',
    mode: 'dark',
    background: 'transparent',
    surface: '#181428',
    text: '#f3e8ff',
    muted: '#c4b5fd',
    accent: '#c084fc',
    accentSoft: '#3b0764',
    border: '#2e2648',
    chart: ['#c084fc', '#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#22d3ee'],
  },
];

export const FONT_FAMILIES = [
  'font-sans',
  'font-grotesk',
  'font-outfit',
  'font-serif',
  'font-mono',
  'font-roboto',
] as const;

export const RADIUS_TOKENS = [
  'rounded-xl',
  'rounded-2xl',
  'rounded-3xl',
  'rounded-[1.75rem]',
] as const;

const LIGHT_STRUCT = {
  background: 'transparent',
  surface: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
};

const DARK_STRUCT = {
  background: 'transparent',
  surface: '#141c2e',
  text: '#e8eef7',
  muted: '#94a3b8',
  border: '#243049',
};

function mixHex(hex: string, other: string, amount: number): string {
  const parse = (value: string) => {
    const raw = value.replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  try {
    const a = parse(hex);
    const b = parse(other);
    const ch = a.map((n, i) => Math.round(n + (b[i] - n) * amount));
    return `#${ch.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return hex;
  }
}

export function getPalette(id?: string): Palette {
  return PALETTES.find((p) => p.id === id) || PALETTES[0];
}

export function palettesForMode(mode: 'light' | 'dark'): Palette[] {
  return PALETTES.filter((p) => p.mode === mode);
}

/** Keep accent/chart identity, but never paint a contrasting board over the app. */
export function harmonizePalette(palette: Palette, mode: 'light' | 'dark'): Palette {
  const struct = mode === 'dark' ? DARK_STRUCT : LIGHT_STRUCT;
  const accentSoft = mode === 'dark'
    ? mixHex(palette.accent, '#0b1220', 0.78)
    : mixHex(palette.accent, '#ffffff', 0.86);
  return {
    ...palette,
    mode,
    background: 'transparent',
    surface: struct.surface,
    text: struct.text,
    muted: struct.muted,
    border: struct.border,
    accentSoft,
  };
}

export function pickPaletteForMode(id: string | undefined, mode: 'light' | 'dark'): Palette {
  const requested = id ? PALETTES.find((p) => p.id === id) : undefined;
  if (requested && requested.mode === mode) return requested;
  const sameFamily = requested
    ? PALETTES.find((p) => p.mode === mode && p.chart[0] === requested.chart[0])
    : undefined;
  return sameFamily || palettesForMode(mode)[0] || PALETTES[0];
}
