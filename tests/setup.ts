import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), `air-test-${process.pid}-`));
process.env.AIR_CONFIG_DIR = join(dir, 'config');
process.env.AIR_CACHE_DIR = join(dir, 'cache');
