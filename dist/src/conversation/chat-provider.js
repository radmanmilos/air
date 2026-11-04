// ChatProvider seam (T7-036). Documented for M3; mock-backed test proves swappability.
export class MockChatProvider {
    name = 'mock';
    async complete(messages) {
        return `mock reply to ${messages.length} messages`;
    }
}
