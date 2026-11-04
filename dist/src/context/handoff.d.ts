import type { GitSnapshot } from '../context/checkpoint';
export interface HandoffOptions {
    cwd: string;
    prompt: string;
    from: {
        id: string;
        provider: string;
        model: string;
    };
    to: {
        id: string;
        provider: string;
        model: string;
    };
    mode: 'ask' | 'auto';
    files?: string[];
    category?: string;
    summary?: string;
    outputTail?: string;
    maxDiffBytes?: number;
    maxTailBytes?: number;
    before?: GitSnapshot;
    after?: GitSnapshot;
    untrackedContentCap?: number;
}
export declare function buildHandoffPack(opts: HandoffOptions): string;
/** Convenience: build a handoff from a snapshot + outcome tail. */
export declare function buildHandoffFromSnapshot(opts: Omit<HandoffOptions, 'outputTail'> & {
    outputTail?: string;
}): string;
