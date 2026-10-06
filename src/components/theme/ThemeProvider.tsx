import React, { useEffect } from 'react';
import { useStore } from '../../store';
import { loadAiSettings, saveAiSettings } from '../../lib/ai/client';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const appearance = useStore((s) => s.appearance);
  const setAiSettings = useStore((s) => s.setAiSettings);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', appearance.mode === 'dark');
    document.documentElement.setAttribute('data-theme', appearance.mode);
    document.documentElement.setAttribute('data-accent', 'blue');
    document.documentElement.style.colorScheme = appearance.mode;
  }, [appearance.mode]);

  useEffect(() => {
    const stored = loadAiSettings();
    const current = useStore.getState().aiSettings;
    if (!current?.apiKey && stored.apiKey) {
      setAiSettings({ ...current, ...stored });
    } else {
      saveAiSettings(current);
    }
  }, [setAiSettings]);

  const aiSettings = useStore((s) => s.aiSettings);
  useEffect(() => {
    saveAiSettings(aiSettings);
  }, [aiSettings]);

  return <>{children}</>;
}
