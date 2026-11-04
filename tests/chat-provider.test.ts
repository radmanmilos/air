import { describe, it, expect } from 'vitest';
import { MockChatProvider } from '../src/conversation/chat-provider';

describe('ChatProvider seam', () => {
  it('mock provider completes', async () => {
    const p = new MockChatProvider();
    const r = await p.complete([{ role: 'user', content: 'hi' }]);
    expect(r).toContain('mock reply');
  });
});