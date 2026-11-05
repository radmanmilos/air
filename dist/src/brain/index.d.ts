export interface BrainResult {
    text: string;
    model: string;
    provider: string;
}
export declare function brainAnswer(prompt: string): BrainResult;
export declare function isBrainAvailable(): boolean;
