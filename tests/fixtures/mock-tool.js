#!/usr/bin/env node
// Mock AI tool for testing air's spawn/stream/timeout/failover behavior.
// Behavior is controlled entirely by environment variables; no network, no
// real agent. Usage: node tests/fixtures/mock-tool.js
//
//   MOCK_MODE=succeed            exit 0, print a fake diff to stdout
//   MOCK_MODE=rate_limit         print limit error to stderr, exit 42
//   MOCK_MODE=auth              print auth error to stderr, exit 5
//   MOCK_MODE=hang              never exit (test timeout)
//   MOCK_MODE=false_positive     print "429 rate limit" in stdout prose, exit 0
//   MOCK_MODE=no_changes        exit 0, no output, no diff
//   MOCK_MODE=crash             exit with signal-like non-zero code
//   MOCK_MODE=stdout_prose_limit  print limit words in stdout, exit 0 (must NOT trigger failover)
//
// Optional: MOCK_DELAY_MS, MOCK_CHUNK_BYTES (chunked stdout), MOCK_SLEEP_MS

const mode = process.env.MOCK_MODE || 'succeed';
const delayMs = parseInt(process.env.MOCK_DELAY_MS || '0', 10);
const chunkBytes = parseInt(process.env.MOCK_CHUNK_BYTES || '0', 10);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeChunked(str) {
  if (!chunkBytes) { process.stdout.write(str); return; }
  for (let i = 0; i < str.length; i += chunkBytes) {
    process.stdout.write(str.slice(i, i + chunkBytes));
  }
}

(async () => {
  if (delayMs) await sleep(delayMs);

  switch (mode) {
    case 'succeed':
      writeChunked('Mock tool: editing src/example.js\n');
      process.stderr.write('Mock tool: all good\n');
      process.exit(0);
    case 'rate_limit':
      process.stderr.write('Error: 429 rate limit exceeded for model\n');
      process.exit(42);
    case 'auth':
      process.stderr.write('Error: 401 invalid api key\n');
      process.exit(5);
    case 'false_positive':
      // Normal model prose that happens to mention rate-limit words.
      writeChunked('Here is the fix for the rate limiter. The 429 status means retry later.\n');
      process.exit(0);
    case 'no_changes':
      process.exit(0);
    case 'crash':
      process.stderr.write('Mock tool: process crashed\n');
      process.exit(134);
    case 'hang':
      // Intentionally never exit; tests rely on timeout.
      await sleep(60000);
      process.exit(0);
    case 'stdout_prose_limit':
      // Limit words in stdout prose, exit 0 -> must NOT be classified as rate_limit.
      writeChunked('Working on the rate limiter. Status 429 seen in logs.\n');
      process.exit(0);
    default:
      process.stderr.write(`Mock tool: unknown mode ${mode}\n`);
      process.exit(2);
  }
})();