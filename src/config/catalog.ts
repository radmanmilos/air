// Catalog loader for installable free AI tools.
//
// Loads the bundled default catalog from config/catalog.json, then optionally
// merges/overrides from a remote URL (catalog.remoteUrl in config). Network
// failures fall back to the bundled catalog with a stderr warning (never
// corrupts MCP stdout).
//
// Remote catalog is cached in the cache dir with a TTL.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './paths';
import type { Config } from './schema';

export interface InstallEntry {
  id: string;
  name: string;
  adapterId: string;
  executable: string;
  provider: string;
  model: string;
  capabilities: Record<string, boolean>;
  description: string;
  tags: string[];
  install: {
    method: 'package-manager' | 'direct-download';
    commands?: Record<string, string>;
    urls?: Record<string, Record<string, DownloadUrl>>;
    verify: string;
    version: string;
  };
}

/** Download URL with optional signature file for integrity verification. */
export interface DownloadUrl {
  url: string;
  /** Optional URL to a signature/hash file. If present, AIR downloads it
   *  and verifies the downloaded binary matches before installing. */
  signatureUrl?: string;
}

export interface CatalogData {
  version: number;
  description: string;
  tools: InstallEntry[];
}

const CATALOG_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

function bundledCatalogPath(): string {
  return join(join(import.meta.dirname, '../../config/catalog.json'));
}

function loadBundledCatalog(): CatalogData {
  const file = bundledCatalogPath();
  if (!existsSync(file)) {
    return { version: 1, description: '', tools: [] };
  }
  return JSON.parse(readFileSync(file, 'utf8')) as CatalogData;
}

function remoteCatalogPath(): string {
  return join(paths.cacheDir, 'catalog-remote.json');
}

async function fetchRemoteCatalog(url: string): Promise<CatalogData | null> {
  // Security: only HTTPS remote catalogs are allowed.
  if (!/^https:\/\//i.test(url)) {
    process.stderr.write(`air: refusing non-HTTPS remote catalog URL: ${url}\n`);
    return null;
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    // Basic structural validation.
    if (!data || typeof data !== 'object') return null;
    const c = data as Record<string, unknown>;
    if (typeof c.version !== 'number' || !Array.isArray(c.tools)) return null;
    const tools: InstallEntry[] = [];
    for (const t of c.tools) {
      if (!t || typeof t !== 'object') continue;
      const e = t as Record<string, unknown>;
      if (typeof e.id !== 'string' || typeof e.name !== 'string') continue;
      // Accept only entries that at least identify themselves; executable/install
      // fields are taken from the bundled catalog when present.
      tools.push(e as unknown as InstallEntry);
    }
    return { version: c.version, description: String(c.description ?? ''), tools };
  } catch {
    return null;
  }
}

function loadCachedRemote(): { data: CatalogData; ts: number } | null {
  try {
    if (!existsSync(remoteCatalogPath())) return null;
    const raw = JSON.parse(readFileSync(remoteCatalogPath(), 'utf8'));
    const now = Date.now();
    if (now - raw.ts > CATALOG_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

function saveCachedRemote(data: CatalogData): void {
  try {
    mkdirSync(paths.cacheDir, { recursive: true });
    writeFileSync(remoteCatalogPath(), JSON.stringify({ data, ts: Date.now() }));
  } catch { /* best-effort */ }
}

function mergeCatalogs(bundled: CatalogData, remote: CatalogData): CatalogData {
  const byId = new Map<string, InstallEntry>();
  for (const t of bundled.tools) byId.set(t.id, { ...t });

  for (const remoteEntry of remote.tools) {
    const existing = byId.get(remoteEntry.id);
    if (!existing) {
      // Remote cannot introduce new installable tools (no executable/install override).
      continue;
    }
    // Only metadata fields may be updated; executable + install stay bundled.
    byId.set(remoteEntry.id, {
      ...existing,
      name: remoteEntry.name || existing.name,
      provider: remoteEntry.provider || existing.provider,
      model: remoteEntry.model || existing.model,
      description: remoteEntry.description || existing.description,
      tags: Array.isArray(remoteEntry.tags) ? remoteEntry.tags : existing.tags,
      capabilities: remoteEntry.capabilities && typeof remoteEntry.capabilities === 'object'
        ? { ...existing.capabilities, ...remoteEntry.capabilities }
        : existing.capabilities,
    });
  }
  return {
    version: remote.version ?? bundled.version,
    description: remote.description ?? bundled.description,
    tools: [...byId.values()],
  };
}

/**
 * Load the adapter install catalog: bundled default + optional remote override.
 * Never throws; falls back to bundled on any error.
 */
export async function loadCatalog(config?: Config): Promise<CatalogData> {
  const bundled = loadBundledCatalog();

  const remoteUrl = config?.catalog?.remoteUrl;
  if (!remoteUrl) return bundled;

  // Try cached remote first.
  const cached = loadCachedRemote();
  if (cached) return mergeCatalogs(bundled, cached.data);

  // Fetch remote.
  const remote = await fetchRemoteCatalog(remoteUrl);
  if (remote) {
    saveCachedRemote(remote);
    return mergeCatalogs(bundled, remote);
  }

  // Network failure: warn to stderr (never stdout, protects MCP protocol) and fall back.
  process.stderr.write(`air: warning: could not fetch remote catalog from ${remoteUrl}; using bundled catalog\n`);
  return bundled;
}

export function catalogTool(catalog: CatalogData, id: string): InstallEntry | undefined {
  return catalog.tools.find((t) => t.id === id);
}

export function catalogTools(catalog: CatalogData): InstallEntry[] {
  return [...catalog.tools];
}
