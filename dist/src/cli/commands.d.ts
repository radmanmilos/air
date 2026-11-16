export interface SlashCommand {
    name: string;
    aliases?: string[];
    group: 'conversation' | 'jobs' | 'inspection' | 'system';
    usage: string;
    description: string;
    example?: string;
}
export declare const SLASH_COMMANDS: SlashCommand[];
export declare const UNIQUE_SLASH_COMMANDS: SlashCommand[];
export declare function formatHelpText(): string;
export declare function findCommand(input: string): SlashCommand | undefined;
export declare function isKnownCommand(input: string): boolean;
