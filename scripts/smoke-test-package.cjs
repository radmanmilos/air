// Package smoke test: install the built tarball and verify `air --help` / `--version`.
// Used by CI (Package smoke test step) after `npm pack`.
const fs = require('fs');
const cp = require('child_process');
const os = require('os');
const path = require('path');

const tgz = fs.readdirSync('.').find((f) => /^air-.*\.tgz$/.test(f));
if (!tgz) throw new Error('no tarball');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'air-smoke-'));
try {
  cp.execSync(`npm install "${tgz}" --prefix "${dir}" --no-save --no-package-lock`, {
    stdio: 'inherit',
  });
  const binDir = path.join(dir, 'node_modules', '.bin');
  const bin = process.platform === 'win32'
    ? path.join(binDir, 'air.cmd')
    : path.join(binDir, 'air');
  cp.execSync(`"${bin}" --help`, { stdio: 'inherit' });
  cp.execSync(`"${bin}" --version`, { stdio: 'inherit' });
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(tgz, { force: true });
}
