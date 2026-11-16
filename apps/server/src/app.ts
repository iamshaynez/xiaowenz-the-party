import { existsSync } from 'node:fs';
import fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { RoomService } from './rooms/room-service';
import { RoomPersistence } from './rooms/persistence';
import { RealtimeGateway } from './realtime/gateway';
import { mapDomainError, registerHttpRoutes } from './http/routes';
import type { ServerOptions } from './config';

interface RateWindow {
  startedAt: number;
  count: number;
}

export async function buildServer(options: ServerOptions) {
  const app = fastify({ logger: options.logger, bodyLimit: 16_384, trustProxy: options.trustProxy ?? false });
  const rooms = new RoomService({ now: options.now, random: options.random ?? Math.random });
  const persistence = options.dataFile
    ? new RoomPersistence(rooms, options.dataFile, (error) => app.log.error(error, 'Failed to persist rooms'))
    : null;
  await persistence?.load();
  const gateway = new RealtimeGateway(rooms, options);
  const httpRates = new Map<string, RateWindow>();

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.headers({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    return payload;
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'POST' && request.url.startsWith('/api/rooms')) {
      const now = options.now();
      const current = httpRates.get(request.ip);
      const window = current && now - current.startedAt < 60_000 ? current : { startedAt: now, count: 0 };
      window.count += 1;
      httpRates.set(request.ip, window);
      if (window.count > 60) {
        return reply.status(429).send({ code: 'RATE_LIMITED', message: '创建或加入房间太频繁，请稍后再试' });
      }
    }
    if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });

  await app.register(websocket, { options: { maxPayload: 4_096 } });
  app.get('/ws', { websocket: true }, (socket, request) => {
    if (options.allowedOrigin && request.headers.origin && request.headers.origin !== options.allowedOrigin) {
      socket.close(1008, 'Origin not allowed');
      return;
    }
    gateway.attach(socket, request);
  });
  registerHttpRoutes(app, rooms, gateway);

  app.setErrorHandler((error, request, reply) => {
    const domainError = mapDomainError(error);
    if (domainError) return reply.status(domainError.status).send(domainError.body);
    const candidateStatus = (error as { statusCode?: unknown }).statusCode;
    const statusCode = typeof candidateStatus === 'number' ? candidateStatus : 500;
    if (statusCode >= 500) request.log.error(error);
    return reply.status(statusCode).send({
      code: statusCode === 400 ? 'INVALID_INPUT' : statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR',
      message: statusCode >= 500 ? '服务暂时不可用' : '请求格式不正确',
    });
  });

  if (options.webRoot && existsSync(options.webRoot)) {
    await app.register(fastifyStatic, { root: options.webRoot, prefix: '/' });
  }
  app.setNotFoundHandler((request, reply) => {
    if (options.webRoot && existsSync(options.webRoot) && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ code: 'NOT_FOUND', message: '页面不存在' });
  });

  app.addHook('onClose', async () => {
    gateway.close();
    await persistence?.close();
    httpRates.clear();
  });
  return app;
}
