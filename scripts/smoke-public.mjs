import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

const origin = process.argv[2] ?? 'https://party.xiaowenz.com';
const healthResponse = await fetch(`${origin}/api/health`);
assert.equal(healthResponse.status, 200, '公网健康接口应返回 200');
const health = await healthResponse.json();
assert.equal(health.status, 'ok');

const pageResponse = await fetch(origin);
assert.equal(pageResponse.status, 200, '公网首页应返回 200');
assert.match(await pageResponse.text(), /碰头 PARTY/, '首页应包含产品标识');

const target = new URL('/ws', origin);
const transport = target.protocol === 'https:' ? https : http;
const key = randomBytes(16).toString('base64');
const expectedAccept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');

await new Promise((resolve, reject) => {
  const request = transport.request(target, {
    method: 'GET',
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Key': key,
      'Sec-WebSocket-Version': '13',
    },
  });
  request.setTimeout(8_000, () => request.destroy(new Error('公网 WebSocket 冒烟超时')));
  request.once('upgrade', (response, socket) => {
    try {
      assert.equal(response.statusCode, 101, 'WebSocket 应切换协议');
      assert.equal(response.headers.upgrade?.toLowerCase(), 'websocket');
      assert.equal(response.headers['sec-websocket-accept'], expectedAccept, 'WebSocket 握手签名不正确');
      socket.destroy();
      resolve();
    } catch (error) {
      socket.destroy();
      reject(error);
    }
  });
  request.once('response', (response) => {
    response.resume();
    reject(new Error(`WebSocket 未升级，HTTP ${response.statusCode}`));
  });
  request.once('error', reject);
  request.end();
});

console.log(`公网冒烟通过：${origin}（HTTP 200 + WS 101 Upgrade）`);
