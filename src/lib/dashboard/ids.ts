const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function mintDashboardId(size = 12): string {
  const bytes = new Uint8Array(size);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function isDerivedMeasure(measure?: { kind?: string } | null): measure is {
  kind: 'ratio' | 'difference' | 'margin' | 'weighted';
  numerator: { field: string; agg?: string };
  denominator: { field: string; agg?: string };
  format?: string;
} {
  return Boolean(
    measure
    && (measure.kind === 'ratio' || measure.kind === 'difference' || measure.kind === 'margin' || measure.kind === 'weighted')
    && 'numerator' in measure
    && 'denominator' in measure,
  );
}

export function looksLikeCountTitle(title?: string): boolean {
  return /\b(count|orders|rows|records|tickets)\b/i.test(title || '');
}
