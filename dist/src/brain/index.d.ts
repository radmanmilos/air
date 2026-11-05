export interface BrainResult {
    text: string;
    model: string;
    provider: string;
}
export type Complexity = 'simple' | 'complex';
export declare function brainAnswer(prompt: string, complexity?: Complexity): BrainResult;
export declare function isBrainAvailable(): boolean;
