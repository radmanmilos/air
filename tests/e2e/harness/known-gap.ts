// tests/e2e/harness/known-gap.ts
import { it } from 'vitest';

export function knownGap(id: string, issue: string, fn: () => void | Promise<void>): void {
  // While the bug exists, the test is expected to fail.
  // Once fixed, it becomes XPASS and forces removal of this marker.
  it.fails(`${id} (KNOWN_GAP ${issue})`, fn);
}