export interface BrainResult {
    text: string;
    model: string;
}
export declare function brainAnswer(prompt: string, model?: string): BrainResult;
export declare function isBrainAvailable(): boolean;
