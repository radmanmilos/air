import { promises as fs } from 'node:fs';
export interface AtomicWriteOptions {
    /** Override used by tests to simulate platform-specific rename failures. */
    rename?: typeof fs.rename;
}
export declare function atomicWriteFile(filePath: string, contents: string, options?: AtomicWriteOptions): Promise<void>;
export declare function atomicWriteJson(filePath: string, value: unknown, options?: AtomicWriteOptions): Promise<void>;
export declare function readJsonFile<T>(filePath: string): Promise<T | null>;
