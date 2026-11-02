// Post-build fixup: append .js to extensionless relative imports in
// compiled output so the published bin works under plain `node` even though
// the source uses `moduleResolution: bundler`.
//
// Run via `npm run postbuild`.

import { promises as fs } from 'node:fs';
import { dirname, extname } from 'node:path';

const RELATIVE = /^[./]/;

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && p.endsWith('.js')) out.push(p);
  }
  return out;
}

function fixImport(spec, fileDir) {
  if (!RELATIVE.test(spec)) return spec;
  if (extname(spec)) return spec;
  return spec + '.js';
}

async function main() {
  const files = await walk('dist');
  for (const file of files) {
    const fileDir = dirname(file);
    const src = await fs.readFile(file, 'utf8');
    let out = src;
    // import { x } from './y'  /  export { x } from './y'
    out = out.replace(
      /(\b(?:import|export)\b[\s\S]*?\bfrom\s+["'])([./][^"']+)(["'])/g,
      (m, pre, spec, post) => pre + fixImport(spec, fileDir) + post,
    );
    // import './y'
    out = out.replace(
      /(\bimport\s+["'])([./][^"']+)(["'])/g,
      (m, pre, spec, post) => pre + fixImport(spec, fileDir) + post,
    );
    // await import('./y')
    out = out.replace(
      /(\bimport\(\s*["'])([./][^"']+)(["']\s*\))/g,
      (m, pre, spec, post) => pre + fixImport(spec, fileDir) + post,
    );
    if (out !== src) await fs.writeFile(file, out, 'utf8');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });