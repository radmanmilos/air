export interface ChatProvider {
    name: string;
    complete(messages: {
        role: string;
        content: string;
    }[]): Promise<string>;
}
export declare class MockChatProvider implements ChatProvider {
    name: string;
    complete(messages: {
        role: string;
        content: string;
    }[]): Promise<string>;
}
