import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

async function walk(dir, out = []) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && p.endsWith('.js')) out.push(p);
  }
  return out;
}

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

let bad = 0;
const files = await walk('dist');
for (const f of files) {
  const src = await fs.readFile(f, 'utf8');
  const re = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const spec = m[1];
    const dir = dirname(f);
    const candidates = [join(dir, spec), join(dir, spec + '.js'), join(dir, spec, 'index.js')];
    let ok = false;
    for (const c of candidates) if (await exists(c)) { ok = true; break; }
    if (!ok) { console.error(`UNRESOLVED: ${f} -> ${spec}`); bad++; }
  }
}
if (bad > 0) { console.error(`\n${bad} unresolved import(s).`); process.exit(1); }
else { console.log(`OK: all relative imports in dist/ resolve (${files.length} files checked).`); }