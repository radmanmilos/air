export interface SeatHandle {
    release: () => Promise<void>;
}
/**
 * Acquire a concurrency seat, enforcing `maxConcurrentAgents` across
 * processes. Returns a handle with `release()`, or null if the cap is
 * reached and the wait timed out.
 */
export declare function acquireSeat(name: string, maxConcurrent: number, options?: {
    seatDir?: string;
    timeoutMs?: number;
}): Promise<SeatHandle | null>;
/** Run a function while holding a concurrency seat. */
export declare function withSeat<T>(name: string, maxConcurrent: number, fn: () => Promise<T>, options?: {
    seatDir?: string;
    timeoutMs?: number;
}): Promise<T | null>;
