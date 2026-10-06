import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useStore } from '../../store';

export function ThemeToggle() {
  const mode = useStore((s) => s.appearance.mode);
  const setAppearance = useStore((s) => s.setAppearance);

  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    const apply = () => setAppearance({ mode: next });
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (typeof doc.startViewTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      doc.startViewTransition(apply);
    } else {
      apply();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="sbi-theme-toggle"
      aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
