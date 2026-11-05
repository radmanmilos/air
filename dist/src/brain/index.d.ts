export interface BrainResult {
    text: string;
    model: string;
    provider: string;
}
export declare function brainAnswer(prompt: string): Promise<BrainResult>;
export declare function isBrainAvailable(): Promise<boolean>;
