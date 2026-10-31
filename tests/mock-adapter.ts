// Test-only re-export of MockAdapter from src/adapters/mock.ts.
// Tests import from here so production code never depends on tests/.
// The mock adapter is injected explicitly; it is never in the default
// production adapter list.

export { MockAdapter } from '../src/adapters/mock';
export { runMockThroughRunner } from './run-mock';