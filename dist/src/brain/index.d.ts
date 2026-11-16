export interface BrainResult {
    text: string;
    model: string;
    provider: string;
}
export interface BrainContext {
    history?: {
        role: string;
        content: string;
    }[];
    jobs?: string[];
}
/** Diagnostic result of checking whether the local brain can answer. */
export interface BrainReadiness {
    available: boolean;
    reason: 'ready' | 'not_configured' | 'config_error' | 'server_unavailable' | 'model_not_found';
    detail?: string;
}
/**
 * Check whether the local brain can answer. Distinguishes server reachability
 * from model availability so callers can report a clear, non-sensitive reason.
 */
export declare function checkBrainReadiness(): Promise<BrainReadiness>;
export declare function brainAnswer(prompt: string, ctx?: BrainContext): Promise<BrainResult>;
export declare function isBrainAvailable(): Promise<boolean>;
