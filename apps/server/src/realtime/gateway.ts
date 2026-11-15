import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { FastifyRequest } from 'fastify';
import { clientMessageSchema } from '@party/protocol';
import type { ServerMessage } from '@party/protocol';
import { DomainError } from '@party/room';
import { RoomService } from '../rooms/room-service';
import type { SessionRecord } from '../rooms/room-service';

interface GatewayOptions {
  now: () => number;
  tickIntervalMs: number;
  messageRateLimit: number;
  messageRateWindowMs: number;
}

interface ConnectionState {
  session: SessionRecord;
  windowStartedAt: number;
  messageCount: number;
  lastSeenAt: number;
  lastPingAt: number;
}

export class RealtimeGateway {
  private readonly connections = new Map<WebSocket, ConnectionState>();
  private readonly ticker: NodeJS.Timeout;

  constructor(
    private readonly rooms: RoomService,
    private readonly options: GatewayOptions,
  ) {
    this.ticker = setInterval(() => {
      this.maintainConnections();
      for (const code of this.rooms.tick()) this.broadcast(code);
    }, options.tickIntervalMs);
    this.ticker.unref();
  }

  get connectionCount() {
    return this.connections.size;
  }

  attach(socket: WebSocket, _request: FastifyRequest) {
    let queue = Promise.resolve();
    const authenticationTimer = setTimeout(() => {
      if (!this.connections.has(socket)) {
        this.sendError(socket, 'AUTH_TIMEOUT', '鉴权超时');
        socket.close(1008, 'Authentication required');
      }
    }, 5_000);
    authenticationTimer.unref();

    socket.on('pong', () => {
      const connection = this.connections.get(socket);
      if (connection) connection.lastSeenAt = this.options.now();
    });
    socket.on('message', (data) => {
      queue = queue.then(() => this.handleRawMessage(socket, data)).catch(() => {
        this.sendError(socket, 'INTERNAL_ERROR', '服务暂时开小差了，请稍后重试');
      });
    });
    socket.on('close', () => {
      clearTimeout(authenticationTimer);
      this.handleDisconnect(socket);
    });
    socket.on('error', () => {
      clearTimeout(authenticationTimer);
    });
  }

  broadcast(roomCode: string) {
    for (const [socket, connection] of this.connections) {
      if (connection.session.roomCode !== roomCode || socket.readyState !== WebSocket.OPEN) continue;
      try {
        this.send(socket, { type: 'room', room: this.rooms.sessionView(connection.session).room });
      } catch (error) {
        if (!(error instanceof DomainError && error.code === 'PLAYER_NOT_FOUND')) throw error;
      }
    }
  }

  close() {
    clearInterval(this.ticker);
    for (const socket of this.connections.keys()) socket.terminate();
    this.connections.clear();
  }

  private async handleRawMessage(socket: WebSocket, data: RawData) {
    const serialized = data.toString();
    if (Buffer.byteLength(serialized) > 4_096) {
      this.sendError(socket, 'MESSAGE_TOO_LARGE', '消息过大');
      socket.close(1009, 'Message too large');
      return;
    }
    const connection = this.connections.get(socket);
    if (connection) connection.lastSeenAt = this.options.now();
    if (connection && !this.consumeRateAllowance(connection)) {
      this.sendError(socket, 'RATE_LIMITED', '操作太频繁了，歇一小会儿');
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(serialized);
    } catch {
      this.sendError(socket, 'INVALID_MESSAGE', '消息不是有效的 JSON');
      return;
    }
    const result = clientMessageSchema.safeParse(parsedJson);
    if (!result.success) {
      this.sendError(socket, 'INVALID_MESSAGE', '消息格式不正确');
      return;
    }
    const message = result.data;

    if (message.type === 'authenticate') {
      if (connection) {
        this.sendError(socket, 'ALREADY_AUTHENTICATED', '这个连接已经鉴权');
        return;
      }
      try {
        const session = this.rooms.authenticate(message.sessionId, message.resumeToken);
        this.connections.set(socket, {
          session,
          windowStartedAt: this.options.now(),
          messageCount: 1,
          lastSeenAt: this.options.now(),
          lastPingAt: this.options.now(),
        });
        this.rooms.reconnect(session);
        this.send(socket, { type: 'ready', session: this.rooms.sessionView(session) });
        this.broadcast(session.roomCode);
      } catch (error) {
        this.handleError(socket, error);
        socket.close(1008, 'Authentication failed');
      }
      return;
    }

    if (!connection) {
      this.sendError(socket, 'AUTH_REQUIRED', '请先完成会话鉴权');
      return;
    }
    if (message.type === 'ping') {
      this.send(socket, { type: 'pong', now: this.options.now() });
      return;
    }

    try {
      switch (message.type) {
        case 'start-game': {
          const outcome = this.rooms.startGame(connection.session, message.actionId, message.gameId, message.rounds);
          this.send(socket, { type: 'action-ack', actionId: message.actionId, version: outcome.version });
          if (outcome.changed) this.broadcast(connection.session.roomCode);
          return;
        }
        case 'game-action': {
          const outcome = this.rooms.act(connection.session, message.actionId, message.action);
          this.send(socket, { type: 'action-ack', actionId: message.actionId, version: outcome.version });
          if (outcome.changed) this.broadcast(connection.session.roomCode);
          return;
        }
        case 'leave-room': {
          const { session } = connection;
          const version = this.rooms.sessionView(session).room.version + 1;
          this.rooms.leave(session);
          this.send(socket, { type: 'action-ack', actionId: message.actionId, version });
          for (const [peer, state] of this.connections) {
            if (state.session.playerId === session.playerId) {
              this.connections.delete(peer);
              peer.close(1000, 'Left room');
            }
          }
          this.broadcast(session.roomCode);
          return;
        }
      }
    } catch (error) {
      this.handleError(socket, error, message.actionId);
    }
  }

  private maintainConnections() {
    const now = this.options.now();
    for (const [socket, connection] of this.connections) {
      if (now - connection.lastSeenAt >= 65_000 && now - connection.lastPingAt >= 10_000) {
        socket.terminate();
        continue;
      }
      if (now - connection.lastPingAt >= 30_000 && socket.readyState === WebSocket.OPEN) {
        connection.lastPingAt = now;
        socket.ping();
      }
    }
  }

  private handleDisconnect(socket: WebSocket) {
    const connection = this.connections.get(socket);
    if (!connection) return;
    this.connections.delete(socket);
    const playerStillOnline = [...this.connections.values()].some(
      (candidate) => candidate.session.playerId === connection.session.playerId,
    );
    if (!playerStillOnline && this.rooms.disconnect(connection.session)) {
      this.broadcast(connection.session.roomCode);
    }
  }

  private consumeRateAllowance(connection: ConnectionState) {
    const now = this.options.now();
    if (now - connection.windowStartedAt >= this.options.messageRateWindowMs) {
      connection.windowStartedAt = now;
      connection.messageCount = 0;
    }
    connection.messageCount += 1;
    return connection.messageCount <= this.options.messageRateLimit;
  }

  private handleError(socket: WebSocket, error: unknown, actionId?: string) {
    if (error instanceof DomainError) {
      this.sendError(socket, error.code, error.message, actionId);
      return;
    }
    this.sendError(socket, 'INTERNAL_ERROR', '服务暂时开小差了，请稍后重试', actionId);
  }

  private sendError(socket: WebSocket, code: string, message: string, actionId?: string) {
    this.send(socket, { type: 'error', code, message, ...(actionId ? { actionId } : {}) });
  }

  private send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}
