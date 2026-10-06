import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Login } from './Login';
import { SpacesLanding } from './SpacesLanding';
import { Settings } from './Settings';
import { useStore } from '../store';
import { createSampleSpace } from '../lib/sampleData';
import { ThinkingLoader } from '../components/shell/ThinkingLoader';

export function ShellPreview() {
  const [params] = useSearchParams();
  const page = params.get('page') || 'landing';
  const mode = params.get('mode') === 'dark' ? 'dark' : 'light';
  const login = useStore((s) => s.login);
  const createSpace = useStore((s) => s.createSpace);
  const spaces = useStore((s) => s.spaces);
  const setAppearance = useStore((s) => s.setAppearance);

  React.useEffect(() => {
    setAppearance({ mode });
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.setAttribute('data-theme', mode);
    login({ id: 'preview', name: 'Eleanor Vance', email: 'admin@sentinel.ai', role: 'Admin' });
    if (spaces.length === 0) createSpace(createSampleSpace('sales'));
  }, [mode, login, createSpace, spaces.length, setAppearance]);

  if (page === 'login') return <Login />;
  if (page === 'generating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <ThinkingLoader />
      </div>
    );
  }
  if (page === 'settings') {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-8">
        <Settings />
      </div>
    );
  }
  return <SpacesLanding />;
}
