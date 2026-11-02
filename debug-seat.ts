import { acquireSeat } from './src/utils/concurrency';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'air-seat-debug-'));
const first = await acquireSeat('t1', 1, { seatDir: dir, timeoutMs: 1000 });
console.log('first:', !!first);
console.log('seats:', readdirSync(dir));
const second = await acquireSeat('t1', 1, { seatDir: dir, timeoutMs: 200 });
console.log('second:', !!second);
console.log('seats:', readdirSync(dir));
if (first) await first.release();
rmSync(dir, { recursive: true, force: true });