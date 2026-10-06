import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardCanvas } from '../components/dashboard/DashboardCanvas';
import { buildFallbackDashboard } from '../lib/dashboard/fallback';
import { LAYOUT_ARCHETYPES, type LayoutArchetype } from '../lib/dashboard/types';
import { createSampleSpace, toDashboardDatasets, type SampleKind } from '../lib/sampleData';
import { useStore } from '../store';

const KINDS: SampleKind[] = ['sales', 'web', 'hr', 'support'];

export function DashboardPreview() {
  const [params] = useSearchParams();
  const setAppearance = useStore((s) => s.setAppearance);
  const kind = (KINDS.includes(params.get('dataset') as SampleKind) ? params.get('dataset') : 'sales') as SampleKind;
  const archetype = (LAYOUT_ARCHETYPES as readonly string[]).includes(params.get('archetype') || '')
    ? (params.get('archetype') as LayoutArchetype)
    : 'hero-kpi-rail';
  const mode = params.get('mode') === 'dark' ? 'dark' : 'light';
  const paletteId = params.get('palette') || undefined;
  const seed = Number(params.get('seed') || 17);

  React.useEffect(() => {
    setAppearance({ mode });
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.style.colorScheme = mode;
  }, [mode, setAppearance]);

  const space = useMemo(() => createSampleSpace(kind), [kind]);
  const datasets = useMemo(() => toDashboardDatasets(space), [space]);
  const spec = useMemo(
    () => buildFallbackDashboard({
      title: space.title,
      intent: space.promptContext,
      datasets,
      seed,
      archetype,
      paletteId,
      mode,
    }),
    [space, datasets, seed, archetype, paletteId, mode],
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex min-h-screen">
        <aside className="hidden md:flex w-56 shrink-0 border-r border-[var(--border)] bg-[var(--sidebar)] flex-col px-4 py-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Workspace</p>
          <p className="mt-1 font-semibold truncate">{space.title}</p>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Visual Model</p>
        </aside>
        <main className="flex-1 min-w-0 p-6 md:p-8">
          <DashboardCanvas spec={spec} datasets={datasets} />
        </main>
      </div>
    </div>
  );
}
