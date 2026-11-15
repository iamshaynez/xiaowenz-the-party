import assert from 'node:assert/strict';

const origin = process.argv[2] ?? 'https://party.xiaowenz.com';
const healthResponse = await fetch(`${origin}/api/health`);
assert.equal(healthResponse.status, 200, '公网健康接口应返回 200');
const health = await healthResponse.json();
assert.equal(health.status, 'ok');

const pageResponse = await fetch(origin);
assert.equal(pageResponse.status, 200, '公网首页应返回 200');
assert.match(await pageResponse.text(), /碰头 PARTY/, '首页应包含产品标识');

const socketOrigin = origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
await new Promise((resolve, reject) => {
  const socket = new WebSocket(`${socketOrigin}/ws`);
  let settled = false;
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    socket.close();
    reject(new Error('公网 WebSocket 冒烟超时'));
  }, 8_000);

  const fail = (message) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    socket.close();
    reject(new Error(message));
  };

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'ping' }));
  });
  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(String(event.data));
      if (message.type === 'error' && message.code === 'AUTH_REQUIRED') {
        settled = true;
        clearTimeout(timeout);
        socket.close();
        resolve();
      } else {
        fail(`收到非预期 WebSocket 消息：${message.code ?? message.type}`);
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  });
  socket.addEventListener('error', () => fail('公网 WebSocket 连接失败'));
  socket.addEventListener('close', (event) => {
    if (!settled) fail(`WebSocket 提前关闭：${event.code}`);
  });
});

console.log(`公网冒烟通过：${origin}（HTTPS 200 + WSS Upgrade）`);
