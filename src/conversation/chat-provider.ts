// ChatProvider seam (T7-036). Documented for M3; mock-backed test proves swappability.

export interface ChatProvider {
  name: string;
  complete(messages: { role: string; content: string }[]): Promise<string>;
}

export class MockChatProvider implements ChatProvider {
  name = 'mock';
  async complete(messages: { role: string; content: string }[]): Promise<string> {
    return `mock reply to ${messages.length} messages`;
  }
}