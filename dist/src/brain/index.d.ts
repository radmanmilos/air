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
export declare function brainAnswer(prompt: string, ctx?: BrainContext): Promise<BrainResult>;
export declare function isBrainAvailable(): Promise<boolean>;
