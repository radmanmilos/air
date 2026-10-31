// Test helper: classify a mock process outcome through the shared
// conformance helper. Uses the mock adapter's classifyError with the
// outcome's exit code and stderr evidence.

import { MockAdapter } from '../src/adapters/mock';
import { classifyError } from '../src/adapters/conformance';
import type { ProcessOutcome } from '../src/types';

export function classifyOutcomeMock(outcome: ProcessOutcome): string {
  const adapter = new MockAdapter();
  return classifyError(adapter, outcome.exitCode, outcome.stderr);
}