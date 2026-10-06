import React from 'react';
import { AuroraFlow } from '../ui/aurora-flow';

export function AuroraBackdrop() {
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    return (
      <div className="sbi-aurora pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="sbi-aurora-blob sbi-aurora-a" />
        <div className="sbi-aurora-blob sbi-aurora-b" />
      </div>
    );
  }
  return (
    <div className="sbi-aurora pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <AuroraFlow className="absolute inset-0 h-full w-full" />
    </div>
  );
}
