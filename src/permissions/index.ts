// Shared permission policy (T-029).
//
// Evaluated before every worker invocation. Decides read/write/shell/network/
// install/commit/push permissions and translates them into the narrowest
// supported adapter flags.

export type PermissionMode = 'read_only' | 'edit' | 'edit_and_shell';

export interface PermissionPolicy {
  mode: PermissionMode;
  broadApproval: boolean;
  autoCommit: boolean;
  allowShell: boolean;
  allowedPaths?: string[];
  allowNetwork: boolean;
  allowInstall: boolean;
}

export const DEFAULT_POLICY: PermissionPolicy = {
  mode: 'read_only',
  broadApproval: false,
  autoCommit: false,
  allowShell: false,
  allowNetwork: false,
  allowInstall: false,
};

export function fromConfig(cfg: any): PermissionPolicy {
  const p = cfg?.permission ?? {};
  const mode = (p.mode === 'edit' || p.mode === 'edit_and_shell') ? p.mode : 'read_only';
  return {
    mode,
    broadApproval: !!p.broadApproval,
    autoCommit: !!p.autoCommit,
    allowShell: !!p.allowShell || mode === 'edit_and_shell',
    allowedPaths: p.allowedPaths,
    allowNetwork: !!p.allowNetwork,
    allowInstall: !!p.allowInstall,
  };
}

export function allowsWrite(policy: PermissionPolicy): boolean {
  return policy.mode === 'edit' || policy.mode === 'edit_and_shell';
}

export function allowsShell(policy: PermissionPolicy): boolean {
  return policy.mode === 'edit_and_shell' && policy.allowShell;
}

export function enforce(policy: PermissionPolicy, required: { write?: boolean; shell?: boolean; network?: boolean }): { ok: boolean; reason?: string } {
  if (required.write && !allowsWrite(policy)) return { ok: false, reason: 'write not permitted by permission mode' };
  if (required.shell && !allowsShell(policy)) return { ok: false, reason: 'shell not permitted' };
  if (required.network && !policy.allowNetwork) return { ok: false, reason: 'network not permitted' };
  return { ok: true };
}
