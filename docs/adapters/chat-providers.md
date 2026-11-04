# Chat Providers

AIR's front-agent supervisor is provider-agnostic. A `ChatProvider` implements:

```ts
interface ChatProvider {
  name: string;
  complete(messages: { role: string; content: string }[]): Promise<string>;
}
```

Swap providers by injecting a different implementation. No second provider ships in M2; a mock proves the seam.
filePath">
E:\GitHub\air\docs\adapters\chat-providers.md