// tests/e2e/pilot/local-pilot.test.ts
// Opt-in local pilot scenarios. These require a real Ollama instance with
// configured models. Skipped unless AIR_PILOT_LOCAL=1.
//
// Run: AIR_PILOT_LOCAL=1 npm run pilot:local
// Or:  npm run pilot:local (with AIR_PILOT_LOCAL=1 set)

import { describe, it, expect } from 'vitest';
import { isBrainAvailable, brainAnswer } from '../../../src/brain';
import { loadConfig } from '../../../src/config/loader';
import { resolveModelRole } from '../../../src/models/role-resolver';

const PILOT_ENABLED = process.env.AIR_PILOT_LOCAL === '1';

describe('pilot: local model availability', () => {
  it('reports brain availability', async () => {
    if (!PILOT_ENABLED) return;
    const available = await isBrainAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('resolves coordinator role from config', async () => {
    if (!PILOT_ENABLED) return;
    const { config, errors } = await loadConfig();
    expect(errors.filter((e) => !e.startsWith('Warning:'))).toHaveLength(0);
    const resolved = resolveModelRole(config, 'coordinator');
    expect(resolved.providerId).toBe('ollama');
    expect(resolved.model.length).toBeGreaterThan(0);
  });

  it('brain answers a simple question', async () => {
    if (!PILOT_ENABLED) return;
    if (!(await isBrainAvailable())) return;
    const r = await brainAnswer('What is 2+2? Answer in one word.');
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.provider).toBe('ollama');
  });
});
