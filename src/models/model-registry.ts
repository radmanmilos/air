import type { ModelCapability, ModelDescriptor } from './types';

type ModelAvailability = 'available' | 'missing' | 'unknown';

export interface ModelRegistryEntry extends ModelDescriptor {
  providerId: string;
  availability: ModelAvailability;
  checkedAt: string;
}

/**
 * In-memory snapshot of models discovered from providers. Capability data is
 * optional and is never inferred from model names or download size.
 */
export class ModelRegistry {
  private readonly entries = new Map<string, ModelRegistryEntry>();

  syncProvider(
    providerId: string,
    models: ModelDescriptor[],
    checkedAt = new Date().toISOString(),
  ): void {
    const discovered = new Set(models.map((model) => model.name));
    for (const [key, entry] of this.entries) {
      if (entry.providerId === providerId && !discovered.has(entry.name)) {
        this.entries.set(key, { ...entry, availability: 'missing', checkedAt });
      }
    }
    for (const model of models) {
      this.entries.set(this.key(providerId, model.name), {
        ...model,
        providerId,
        availability: 'available',
        checkedAt,
      });
    }
  }

  markProviderUnavailable(providerId: string, checkedAt = new Date().toISOString()): void {
    for (const [key, entry] of this.entries) {
      if (entry.providerId === providerId) {
        this.entries.set(key, { ...entry, availability: 'unknown', checkedAt });
      }
    }
  }

  get(providerId: string, model: string): ModelRegistryEntry | undefined {
    return this.entries.get(this.key(providerId, model));
  }

  list(providerId?: string): ModelRegistryEntry[] {
    const values = [...this.entries.values()];
    return providerId ? values.filter((entry) => entry.providerId === providerId) : values;
  }

  supports(
    providerId: string,
    model: string,
    capability: ModelCapability,
  ): boolean | undefined {
    const entry = this.get(providerId, model);
    if (!entry || entry.availability === 'missing') return false;
    if (entry.availability === 'unknown' || !entry.capabilities) return undefined;
    return entry.capabilities.includes(capability);
  }

  private key(providerId: string, model: string): string {
    return JSON.stringify([providerId, model]);
  }
}
