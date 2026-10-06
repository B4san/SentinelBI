import React from 'react';

export function LiquidSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`sbi-liquid ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="sbi-liquid-knob" />
    </button>
  );
}
