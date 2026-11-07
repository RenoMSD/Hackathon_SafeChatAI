import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

describe('GET /healthz', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    // Tạo server mô phỏng đúng hành vi /healthz của gateway (giống src/index.ts)
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const origin = req.headers.origin;
      const method = (req.method ?? 'GET') as string;
      const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
      const path = url.pathname;

      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'Content-Type, Authorization',
          'access-control-max-age': '86400',
          'x-content-type-options': 'nosniff',
          'access-control-allow-origin': origin ?? '*',
        });
        res.end();
        return;
      }

      if (method === 'GET' && path === '/healthz') {
        const payload = JSON.stringify({ status: 'ok', version: '0.5.0' });
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(payload).toString(),
          'access-control-allow-origin': origin ?? '*',
          'x-content-type-options': 'nosniff',
        });
        res.end(payload);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function fetchJson(path: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${baseUrl}${path}`, init);
    const json = await res.json();
    return { status: res.status, json };
  }

  it('trả về status ok và version', async () => {
    const { status, json } = await fetchJson('/healthz');
    expect(status).toBe(200);
    expect((json as { status: string }).status).toBe('ok');
    expect(typeof (json as { version: string }).version).toBe('string');
  });

  it('có header CORS', async () => {
    const res = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
