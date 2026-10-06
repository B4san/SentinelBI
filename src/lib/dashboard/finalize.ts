import { repairCatalogWidgets } from './catalog';
import { attachComputedFacts, dedupeHeadlines, rewriteUnverifiedCopy } from './facts';
import type { DashboardDataset, DashboardSpec } from './types';

export function finalizeDashboardSpec(
  spec: DashboardSpec,
  datasets: DashboardDataset[],
  opts: { verifyCopy?: boolean } = {},
): DashboardSpec {
  const repaired = repairCatalogWidgets(spec, datasets);
  const computed = attachComputedFacts(repaired, datasets);
  const verified = opts.verifyCopy === false ? computed : rewriteUnverifiedCopy(computed, datasets);
  return dedupeHeadlines(verified);
}
