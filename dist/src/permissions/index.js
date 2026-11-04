// Shared permission policy (T-029).
//
// Evaluated before every worker invocation. Decides read/write/shell/network/
// install/commit/push permissions and translates them into the narrowest
// supported adapter flags.
export const DEFAULT_POLICY = {
    mode: 'read_only',
    broadApproval: false,
    autoCommit: false,
    allowShell: false,
    allowNetwork: false,
    allowInstall: false,
};
export function fromConfig(cfg) {
    const p = cfg?.permission;
    if (!p)
        return { ...DEFAULT_POLICY };
    const cfgMode = p.mode ?? 'ask';
    const mode = cfgMode === 'deny' ? 'read_only' :
        cfgMode === 'edit_and_shell' ? 'edit_and_shell' :
            cfgMode === 'edit' ? 'edit' :
                cfgMode === 'ask' || cfgMode === 'auto' ? 'edit' : 'read_only';
    // Shell only if explicitly allowed.
    const allowShell = !!p.allowShell;
    const finalMode = allowShell ? 'edit_and_shell' : mode;
    return {
        mode: finalMode,
        broadApproval: !!p.broadApproval,
        autoCommit: !!p.autoCommit,
        allowShell,
        allowedPaths: p.allowedPaths,
        allowNetwork: !!p.allowNetwork,
        allowInstall: !!p.allowInstall,
    };
}
export function allowsWrite(policy) {
    return policy.mode === 'edit' || policy.mode === 'edit_and_shell';
}
export function allowsShell(policy) {
    return policy.mode === 'edit_and_shell' && policy.allowShell;
}
export function conforms(policy, adapterCaps) {
    if (allowsWrite(policy) && !adapterCaps.fileEditing)
        return { ok: false, reason: 'adapter lacks fileEditing' };
    if (allowsShell(policy) && !adapterCaps.shellAccess)
        return { ok: false, reason: 'adapter lacks shellAccess' };
    return { ok: true };
}
export function enforce(policy, required) {
    if (required.write && !allowsWrite(policy))
        return { ok: false, reason: 'write not permitted by permission mode' };
    if (required.shell && !allowsShell(policy))
        return { ok: false, reason: 'shell not permitted' };
    if (required.network && !policy.allowNetwork)
        return { ok: false, reason: 'network not permitted' };
    return { ok: true };
}
