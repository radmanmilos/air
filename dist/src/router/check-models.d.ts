export interface ModelCheckResult {
    adapters: {
        id: string;
        provider: string;
        model: string;
        available: boolean;
        reason?: string;
    }[];
    allowed: {
        id: string;
        ok: boolean;
        reason?: string;
    }[];
    allOk: boolean;
}
export declare function checkModels(): ModelCheckResult;
export declare function formatModelCheck(result: ModelCheckResult): string;
