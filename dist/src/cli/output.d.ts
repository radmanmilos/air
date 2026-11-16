/** True when stdout is a TTY and color is not explicitly disabled. */
export declare function supportsColor(): boolean;
/** True when AIR may use interactive presentation (TTY stdin + stdout). */
export declare function isInteractive(): boolean;
export declare function configureColor(): void;
export declare const out: {
    cyan: (s: string) => string;
    gray: (s: string) => string;
    bold: (s: string) => string;
    yellow: (s: string) => string;
    red: (s: string) => string;
    green: (s: string) => string;
};
/** One-line startup header. No box, no slogan, no banner. */
export declare function startupHeader(version: string, extra?: string): string;
/** Plain log line to stdout. */
export declare function log(message: string): void;
/** Status line to stderr (diagnostics only; never stdout). */
export declare function status(message: string): void;
/** Print the first-run welcome. Never installs or starts anything. */
export declare function printWelcome(version: string): Promise<void>;
