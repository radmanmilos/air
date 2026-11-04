import { describe, it, expect } from 'vitest';
import { fromConfig, allowsWrite, allowsShell, enforce, DEFAULT_POLICY } from '../src/permissions';

describe('permission policy (T-029)', () => {
  it('defaults to read_only', () => {
    expect(fromConfig({}).mode).toBe('read_only');
    expect(allowsWrite(DEFAULT_POLICY)).toBe(false);
    expect(allowsShell(DEFAULT_POLICY)).toBe(false);
  });

  it('edit mode allows write but not shell', () => {
    const p = fromConfig({ permission: { mode: 'edit' } });
    expect(allowsWrite(p)).toBe(true);
    expect(allowsShell(p)).toBe(false);
  });

  it('edit_and_shell allows both', () => {
    const p = fromConfig({ permission: { mode: 'edit_and_shell', allowShell: true } });
    expect(allowsWrite(p)).toBe(true);
    expect(allowsShell(p)).toBe(true);
  });

  it('enforce blocks disallowed', () => {
    expect(enforce(DEFAULT_POLICY, { write: true }).ok).toBe(false);
    expect(enforce(DEFAULT_POLICY, { write: false }).ok).toBe(true);
  });
});
