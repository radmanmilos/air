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
export declare const DEFAULT_POLICY: PermissionPolicy;
export declare function fromConfig(cfg: any): PermissionPolicy;
export declare function allowsWrite(policy: PermissionPolicy): boolean;
export declare function allowsShell(policy: PermissionPolicy): boolean;
export declare function conforms(policy: PermissionPolicy, adapterCaps: {
    fileEditing?: boolean;
    shellAccess?: boolean;
}): {
    ok: boolean;
    reason?: string;
};
export declare function enforce(policy: PermissionPolicy, required: {
    write?: boolean;
    shell?: boolean;
    network?: boolean;
}): {
    ok: boolean;
    reason?: string;
};
