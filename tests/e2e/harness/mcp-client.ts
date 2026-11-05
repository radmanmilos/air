// tests/e2e/harness/mcp-client.ts
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const AIR_BIN = join(process.cwd(), 'dist', 'bin', 'air.js');

export interface McpClient { request(method: string, params?: any): Promise<any>; close(): void; }

export function startMcpClient(env: Record<string, string>, cwd: string): McpClient {
  const child = spawn(process.execPath, [AIR_BIN, 'mcp'], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  let idCounter = 1;
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)!.resolve(msg);
          pending.delete(msg.id);
        }
      } catch { /* noop */ }
    }
  });
  return {
    request(method: string, params?: any): Promise<any> {
      const id = idCounter++;
      const req = { jsonrpc: '2.0', id, method, params: params ?? {} };
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify(req) + '\n');
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error('mcp timeout')); }
        }, 10000);
      });
    },
    close() { try { child.stdin.end(); } catch { /* noop */ } try { child.kill(); } catch { /* noop */ } },
  };
}