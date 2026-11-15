import type { FastifyInstance, FastifyReply } from 'fastify';
import { AVATARS, createRoomRequestSchema, joinRoomRequestSchema, VOTING_DURATION_MS } from '@party/protocol';
import { gameRegistry } from '@party/games';
import { DomainError } from '@party/room';
import { RoomService } from '../rooms/room-service';
import type { RealtimeGateway } from '../realtime/gateway';

function invalidInput(reply: FastifyReply) {
  return reply.status(400).send({ code: 'INVALID_INPUT', message: '请检查昵称、头像和房间信息' });
}

export function registerHttpRoutes(app: FastifyInstance, rooms: RoomService, gateway: RealtimeGateway) {
  app.get('/api/health', async () => ({
    status: 'ok',
    activeRooms: rooms.activeRooms,
    connections: gateway.connectionCount,
    now: Date.now(),
  }));

  app.get('/api/config', async () => ({
    avatars: AVATARS,
    votingDurationMs: VOTING_DURATION_MS,
    games: [...gameRegistry.values()].map((game) => ({
      id: game.id,
      version: game.version,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
    })),
  }));

  app.post('/api/rooms', async (request, reply) => {
    const body = createRoomRequestSchema.safeParse(request.body);
    if (!body.success) return invalidInput(reply);
    return reply.status(201).send(rooms.createRoom(body.data.nickname, body.data.avatar));
  });

  app.post('/api/rooms/:code/join', async (request, reply) => {
    const params = request.params as { code?: string };
    if (!params.code || !/^[a-z0-9]{6}$/i.test(params.code)) {
      return reply.status(400).send({ code: 'INVALID_ROOM_CODE', message: '房间码应该是六位字母或数字' });
    }
    const body = joinRoomRequestSchema.safeParse(request.body);
    if (!body.success) return invalidInput(reply);
    return reply.send(rooms.joinRoom(params.code, body.data.nickname, body.data.avatar));
  });
}

export function mapDomainError(error: unknown) {
  if (error instanceof DomainError) {
    const status = error.code === 'ROOM_NOT_FOUND' ? 404
      : error.code === 'AUTH_FAILED' ? 401
        : error.code.startsWith('INVALID_') ? 400
          : 409;
    return { status, body: { code: error.code, message: error.message } };
  }
  return null;
}
