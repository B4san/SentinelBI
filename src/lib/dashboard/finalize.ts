import { repairCatalogWidgets } from './catalog';
import { attachComputedFacts, dedupeHeadlines, rewriteUnverifiedCopy } from './facts';
import type { DashboardDataset, DashboardSpec } from './types';

export function finalizeDashboardSpec(spec: DashboardSpec, datasets: DashboardDataset[]): DashboardSpec {
  const repaired = repairCatalogWidgets(spec, datasets);
  const computed = attachComputedFacts(repaired, datasets);
  const verified = rewriteUnverifiedCopy(computed, datasets);
  return dedupeHeadlines(verified);
}
