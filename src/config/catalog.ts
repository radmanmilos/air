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
    urls?: Record<string, Record<string, string>>;
    verify: string;
    version: string;
  };
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
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return (await res.json()) as CatalogData;
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
  for (const t of bundled.tools) byId.set(t.id, t);
  for (const t of remote.tools) byId.set(t.id, t); // remote overrides bundled
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
