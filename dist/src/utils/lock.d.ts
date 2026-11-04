export interface LockHandle {
    release: () => Promise<void>;
}
export declare function isPidAlive(pid: number): Promise<boolean>;
export declare function acquireLock(name: string, options?: {
    lockDir?: string;
    timeoutMs?: number;
}): Promise<LockHandle | null>;
export declare function withLock<T>(name: string, fn: () => Promise<T>, options?: {
    lockDir?: string;
    timeoutMs?: number;
}): Promise<T | null>;
export declare function lockedReadModifyWrite<T>(name: string, file: string, mutate: (current: T | null) => Promise<T>, options?: {
    lockDir?: string;
    timeoutMs?: number;
}): Promise<T | null>;
