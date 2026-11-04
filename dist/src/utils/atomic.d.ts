export declare function atomicWriteFile(filePath: string, contents: string): Promise<void>;
export declare function atomicWriteJson(filePath: string, value: unknown): Promise<void>;
export declare function readJsonFile<T>(filePath: string): Promise<T | null>;
