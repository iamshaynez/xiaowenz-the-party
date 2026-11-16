import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('公网冒烟脚本的可移植性', () => {
  it('仅使用 Node 内置模块验证 HTTP 页面、健康接口和 WebSocket 101 Upgrade', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/api/health') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
      } else {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<title>碰头 PARTY</title>');
      }
    });
    const upgradedSockets = new Set<Duplex>();
    server.on('upgrade', (request, socket) => {
      upgradedSockets.add(socket);
      socket.once('close', () => upgradedSockets.delete(socket));
      const key = String(request.headers['sec-websocket-key']);
      const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const script = new URL('../../scripts/smoke-public.mjs', import.meta.url).pathname;

    try {
      const result = await new Promise<{ status: number | null; output: string }>((resolve, reject) => {
        const child = spawn(process.execPath, [script, `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', (data) => { output += String(data); });
        child.stderr.on('data', (data) => { output += String(data); });
        child.once('error', reject);
        child.once('exit', (status) => resolve({ status, output }));
      });
      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain('101 Upgrade');
    } finally {
      server.closeAllConnections();
      for (const socket of upgradedSockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15_000);
});
