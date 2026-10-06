import { describe, expect, it, vi } from 'vitest';
import { extractRoutedModel } from '../src/lib/ai/openaiCompatible';
import { isOpenRouterFreeRouter, PROVIDERS } from '../src/lib/ai/providers';
import { resolveProviderConfig } from '../src/lib/ai/resolve';
import { COMPONENT_CATALOG, catalogPromptBlock } from '../src/lib/dashboard/catalog';
import { applyLiveCopy } from '../src/lib/dashboard/facts';
import { buildFallbackDashboard } from '../src/lib/dashboard/fallback';
import { generateDashboardOnServer } from '../src/lib/dashboard/generate';
import { isLowInformationCut } from '../src/lib/dashboard/insights';
import { ARC_DESIGN_GUIDE, EXAMPLE_SPECS, buildDashboardPrompt, catalogPromptBlock as promptCatalog, promptGuideTokenEstimate } from '../src/lib/dashboard/prompt';
import { prepareChartSeries } from '../src/lib/dashboard/aggregate';
import { validateDashboardSpec } from '../src/lib/dashboard/validate';
import { SAMPLE_FINANCE_ROWS, SAMPLE_SALES_ROWS } from '../src/lib/sampleData';
import { clearStructuredOutputCache } from '../src/lib/ai/openaiCompatible';

const sales = {
  id: 'ds-sales',
  name: 'Sales',
  data: SAMPLE_SALES_ROWS,
  columns: Object.keys(SAMPLE_SALES_ROWS[0] || {}).map((name) => ({ name })),
};

const finance = {
  id: 'ds-finance',
  name: 'Finance',
  data: SAMPLE_FINANCE_ROWS,
  columns: Object.keys(SAMPLE_FINANCE_ROWS[0] || {}).map((name) => ({ name })),
};

describe('openrouter/free', () => {
  it('is the OpenRouter default and is overridden by OPENROUTER_MODEL', () => {
    expect(PROVIDERS.openrouter.defaultModel).toBe('openrouter/free');
    expect(PROVIDERS.openrouter.curatedModels[0].id).toBe('openrouter/free');
    expect(isOpenRouterFreeRouter('openrouter/free')).toBe(true);
    const def = resolveProviderConfig({ provider: 'openrouter' }, { AI_PROVIDER: 'openrouter' });
    expect(def.model).toBe('openrouter/free');
    const env = resolveProviderConfig(
      { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
      { AI_PROVIDER: 'openrouter', OPENROUTER_MODEL: 'anthropic/claude-3.5-sonnet', AI_MODEL: 'ignored' },
    );
    expect(env.model).toBe('anthropic/claude-3.5-sonnet');
  });

  it('skips json_schema and records the routed model', async () => {
    clearStructuredOutputCache();
    const fetchImpl = vi.fn(async (url: string, _init?: { body?: string }) => {
      if (String(url).includes('/models')) {
        return { status: 200, text: async () => JSON.stringify({ data: [{ id: 'openrouter/free', supported_parameters: ['structured_outputs'] }] }) };
      }
      return {
        status: 200,
        text: async () => JSON.stringify({
          model: 'google/gemma-2-9b-it:free',
          choices: [{ message: { content: JSON.stringify({ title: 'Hijacked', widgets: [{ type: 'kpi', title: 'Total revenue', measure: { field: 'revenue', agg: 'sum', format: 'currency' } }] }) } }],
        }),
      };
    });
    const result = await generateDashboardOnServer({
      title: 'Northstar Revenue',
      datasets: [sales],
      seed: 4,
      apiKey: 'k',
      provider: 'openrouter',
      model: 'openrouter/free',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }, { AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' });
    const formats = fetchImpl.mock.calls
      .filter((call) => String(call[0]).includes('/chat/completions'))
      .map((call) => JSON.parse(String((call[1] as { body?: string })?.body || '{}')).response_format?.type || 'plain');
    expect(formats).not.toContain('json_schema');
    expect(formats[0]).toBe('json_object');
    expect(result.spec.title).toBe('Northstar Revenue');
    expect(result.spec.generatedBy).toBe('google/gemma-2-9b-it:free');
    expect(result.attempts?.some((a) => a.model === 'google/gemma-2-9b-it:free')).toBe(true);
    expect(fetchImpl.mock.calls.every((call) => !String(call[0]).includes('/models'))).toBe(true);
    const chatBody = JSON.parse(String((fetchImpl.mock.calls.find((call) => String(call[0]).includes('/chat/completions'))?.[1] as { body?: string })?.body || '{}'));
    expect(chatBody.max_tokens).toBe(8000);
    expect(chatBody.temperature).toBe(0.4);
  });

  it('extracts the routed model field', () => {
    expect(extractRoutedModel({ model: 'meta-llama/llama-3.3-70b-instruct:free' })).toBe('meta-llama/llama-3.3-70b-instruct:free');
  });
});

describe('Arc prompt', () => {
  it('includes every catalog id and keeps the guide under 6k tokens', () => {
    const block = catalogPromptBlock();
    for (const entry of COMPONENT_CATALOG) {
      expect(block).toContain(entry.id);
    }
    expect(promptCatalog()).toBe(block);
    expect(ARC_DESIGN_GUIDE).toMatch(/NEVER state numbers/i);
    expect(promptGuideTokenEstimate()).toBeLessThan(6000);
  });

  it('validates both example specs against the schema', () => {
    const editorial = validateDashboardSpec(EXAMPLE_SPECS.editorial);
    const command = validateDashboardSpec(EXAMPLE_SPECS['command-center']);
    expect(editorial.widgets.length).toBeGreaterThan(5);
    expect(command.widgets.length).toBeGreaterThan(5);
    expect(editorial.archetype).toBe('editorial');
    expect(command.archetype).toBe('command-center');
  });

  it('builds a prompt that names every catalog component', () => {
    const { prompt } = buildDashboardPrompt({ title: 'Sales', datasets: [sales], seed: 1, preferredArchetype: 'editorial' });
    for (const entry of COMPONENT_CATALOG) {
      expect(prompt).toContain(entry.id);
    }
  });
});

describe('live filters and low-information charts', () => {
  it('recomputes insight copy when a region filter is applied', () => {
    const spec = validateDashboardSpec({
      title: 'Sales',
      widgets: [{
        type: 'insight',
        title: 'Revenue cooled',
        insight: { title: 'Revenue cooled', text: 'Revenue fell 19% in the second half of the window versus the first.' },
      }],
    });
    const live = applyLiveCopy(spec, [sales], [{ field: 'region', op: 'equals', value: 'APAC' }]);
    const blob = `${live.subtitle || ''} ${live.widgets.map((w) => `${w.title} ${w.insight?.text || ''}`).join(' ')}`;
    expect(blob).not.toMatch(/fell 19%/i);
    expect(blob.length).toBeGreaterThan(10);
  });

  it('lets a treemap respond to a filter on another field', () => {
    const filtered = prepareChartSeries([sales], {
      id: 't',
      type: 'chart',
      title: 'Revenue mix',
      layout: { x: 0, y: 0, w: 6, h: 5 },
      chartType: 'treemap',
      componentId: 'arc.treemap',
      xField: 'region',
      yField: 'revenue',
    }, [{ field: 'channel', op: 'equals', value: 'Web' }]);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((row) => Number(row.value) > 0)).toBe(true);
  });

  it('flags near-equal cost-center headcount as low information', () => {
    expect(isLowInformationCut(SAMPLE_FINANCE_ROWS, 'cost_center', 'headcount')).toBe(true);
    expect(isLowInformationCut(SAMPLE_SALES_ROWS, 'region', 'revenue')).toBe(false);
  });

  it('does not emit a headcount-by-cost-center bar chart on finance fallback', () => {
    const spec = buildFallbackDashboard({
      title: 'Finance Operations',
      intent: 'finance operations',
      datasets: [finance],
      seed: 17,
      archetype: 'command-center',
      mode: 'light',
    });
    const blob = spec.widgets.filter((w) => w.type === 'chart').map((w) => `${w.title}|${w.xField}|${w.yField}`).join(';');
    expect(blob).not.toMatch(/headcount.*cost_center|cost_center.*headcount/i);
  });
});
