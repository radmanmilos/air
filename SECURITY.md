# Security

## Dependency vulnerability status (as of 2026-11-02)

`npm audit` reports **19 vulnerabilities, all in dev-only dependencies**:

| Package | Severity | Exposure | Fix |
|---|---|---|---|
| esbuild / vite / vite-node / vitest | moderate | dev build/test toolchain only; never shipped in the published tarball | `npm audit fix --force` would break vitest (breaking change) |
| tinypool | 2 critical | prototype-pollution gadget in worker options; reachable only through vitest's test runner | dev-only; no runtime exposure |
| minimatch | moderate | globparts DoS; reachable through `@eslint/eslintrc` | no fix available |
| @eslint/eslintrc | moderate | transitive via eslint | dev-only |

**Production dependencies are clean.** `package.json` `dependencies` is:
`commander`, `yaml`, `zod ^4.6.7`, `cross-spawn`, `chalk`, `@modelcontextprotocol/sdk`.

The one production-dep high advisory (zod `GHSA-mrhx-c7xc-m3w5`) was resolved by
bumping zod from `^3.23.0` to `^4.6.7` — see commit history. No 3.x fix exists.

### Why dev-only vulns are accepted here

The published npm package contains only the compiled `dist/` output and the
declared production dependencies. None of esbuild, vite, vitest, tinypool or
minimatch is installed for end users; they only exist in a developer's
`node_modules` when running `npm ci` for tests/lint/build. There is no attack
surface for a user who runs `npm i air`.

### Re-audit trigger

Re-run `npm audit` and update this file when:
- a production dependency gains a new advisory, or
- a dev dependency is upgraded to a version that ships a fix without a
  breaking change.