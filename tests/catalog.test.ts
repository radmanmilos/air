import { buildModelCatalog, bestModelFor, formatModelCatalog, formatBestModel } from '../src/router/catalog';
import { AiderAdapter } from '../src/adapters/aider';
import { GooseAdapter } from '../src/adapters/goose';
import { MockAdapter } from '../src/adapters/mock';
import { describe, it, expect } from 'vitest';

describe('model catalog (R5-24)', () => {
  it('lists every adapter with provider/model and capabilities', () => {
    const catalog = buildModelCatalog([new AiderAdapter(), new GooseAdapter()]);
    expect(catalog).toHaveLength(2);
    const aider = catalog.find((m) => m.id === 'aider');
    expect(aider).toBeTruthy();
    expect(aider!.provider).toBe('openrouter');
    expect(aider!.model).toBe('gemma-4-31b-it:free');
    expect(aider!.capabilities.headless).toBe(true);
    expect(typeof aider!.costTier).toBe('number');
  });

  it('prefers the cheapest eligible model', () => {
    const catalog = buildModelCatalog([new AiderAdapter(), new GooseAdapter()]);
    const best = bestModelFor(catalog, { mode: 'ask', readOnly: false });
    expect(best).toBeTruthy();
    // Aider's free model should be cheaper than goose's gpt-4o.
    expect(best!.costTier).toBeLessThan(2);
  });

  it('formats the catalog for human output', () => {
    const catalog = buildModelCatalog([new AiderAdapter()]);
    const text = formatModelCatalog(catalog);
    expect(text).toContain('air models');
    expect(text).toContain('aider');
    expect(text).toContain('openrouter');
  });

  it('formats a best-model recommendation', () => {
    const catalog = buildModelCatalog([new AiderAdapter()]);
    const text = formatBestModel(catalog, { mode: 'ask', readOnly: false });
    expect(text).toContain('Best model');
    expect(text).toContain('aider');
  });

  it('builds a catalog from the mock adapter', () => {
    const catalog = buildModelCatalog([new MockAdapter()]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].id).toBe('mock');
    expect(catalog[0].capabilities.headless).toBe(true);
  });
});