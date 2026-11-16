/**
 * In-memory snapshot of models discovered from providers. Capability data is
 * optional and is never inferred from model names or download size.
 */
export class ModelRegistry {
    entries = new Map();
    syncProvider(providerId, models, checkedAt = new Date().toISOString()) {
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
    markProviderUnavailable(providerId, checkedAt = new Date().toISOString()) {
        for (const [key, entry] of this.entries) {
            if (entry.providerId === providerId) {
                this.entries.set(key, { ...entry, availability: 'unknown', checkedAt });
            }
        }
    }
    get(providerId, model) {
        return this.entries.get(this.key(providerId, model));
    }
    list(providerId) {
        const values = [...this.entries.values()];
        return providerId ? values.filter((entry) => entry.providerId === providerId) : values;
    }
    supports(providerId, model, capability) {
        const entry = this.get(providerId, model);
        if (!entry || entry.availability === 'missing')
            return false;
        if (entry.availability === 'unknown' || !entry.capabilities)
            return undefined;
        return entry.capabilities.includes(capability);
    }
    key(providerId, model) {
        return JSON.stringify([providerId, model]);
    }
}
