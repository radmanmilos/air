export interface RedactionOptions {
    allow?: RegExp[];
}
export declare function redact(text: string, options?: RedactionOptions): string;
export declare function redactValue(value: unknown, depth?: number): unknown;
export declare function containsSecret(text: string): boolean;
export declare function redactEnvContents(contents: string): string;
