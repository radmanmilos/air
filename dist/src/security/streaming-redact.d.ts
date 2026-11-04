import { containsSecret } from '../security/redact';
export declare class StreamingRedactor {
    private rawWithheld;
    private decoder;
    /** Feed one chunk; returns the redacted text safe to emit now. */
    feed(chunk: Buffer | string): string;
    /** Finalize: emit the remaining withheld suffix exactly once. */
    flush(): string;
}
/** Convenience: redact an entire string in one pass. */
export declare function redactFull(text: string): string;
export { containsSecret };
