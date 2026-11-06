import type { Conversation } from './index';
export interface DecideHints {
    requiresWrite?: boolean;
    requiresCode?: boolean;
}
export declare function decide(message: string, conv: Conversation): any[];
