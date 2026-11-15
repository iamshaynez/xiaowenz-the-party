import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DomainError, PartyRoom } from '@party/room';
import { ROOM_CODE_ALPHABET } from '@party/protocol';
import type { GameAction, Session } from '@party/protocol';

export interface SessionRecord {
  sessionId: string;
  playerId: string;
  roomCode: string;
  resumeToken: string;
}

interface RoomAggregate {
  room: PartyRoom;
  sessions: Map<string, SessionRecord>;
  processedActions: Map<string, { fingerprint: string; version: number }>;
}

interface RoomServiceOptions {
  now: () => number;
  random?: () => number;
  roomTtlMs?: number;
}

const secureToken = () => `rt_${randomBytes(24).toString('base64url')}`;
const sessionId = () => `s_${randomUUID()}`;
const playerId = () => `p_${randomUUID()}`;

function tokenMatches(expected: string, received: string) {
  const left = createHash('sha256').update(expected).digest();
  const right = createHash('sha256').update(received).digest();
  return timingSafeEqual(left, right);
}

export class RoomService {
  private readonly rooms = new Map<string, RoomAggregate>();
  private readonly sessionIndex = new Map<string, SessionRecord>();
  private readonly random: () => number;
  private readonly roomTtlMs: number;

  constructor(private readonly options: RoomServiceOptions) {
    this.random = options.random ?? Math.random;
    this.roomTtlMs = options.roomTtlMs ?? 2 * 60 * 60 * 1000;
  }

  get activeRooms() {
    return this.rooms.size;
  }

  createRoom(nickname: string, avatar: string): Session {
    let code = '';
    do {
      code = Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[Math.floor(this.random() * ROOM_CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const record = this.newRecord(code);
    const room = PartyRoom.create({ code, owner: { id: record.playerId, nickname, avatar }, now: this.options.now() });
    const aggregate: RoomAggregate = { room, sessions: new Map([[record.sessionId, record]]), processedActions: new Map() };
    this.rooms.set(code, aggregate);
    this.sessionIndex.set(record.sessionId, record);
    return this.sessionView(record);
  }

  joinRoom(rawCode: string, nickname: string, avatar: string): Session {
    const code = rawCode.toUpperCase();
    const aggregate = this.rooms.get(code);
    if (!aggregate) throw new DomainError('ROOM_NOT_FOUND', '没有找到这个房间，检查一下房间码吧');
    const record = this.newRecord(code);
    aggregate.room.addPlayer({ id: record.playerId, nickname, avatar }, this.options.now());
    aggregate.sessions.set(record.sessionId, record);
    this.sessionIndex.set(record.sessionId, record);
    return this.sessionView(record);
  }

  authenticate(sessionIdValue: string, resumeToken: string): SessionRecord {
    const record = this.sessionIndex.get(sessionIdValue);
    if (!record || !tokenMatches(record.resumeToken, resumeToken)) {
      throw new DomainError('AUTH_FAILED', '会话已经失效，请重新加入房间');
    }
    return record;
  }

  sessionView(record: SessionRecord): Session {
    return {
      sessionId: record.sessionId,
      playerId: record.playerId,
      roomCode: record.roomCode,
      resumeToken: record.resumeToken,
      room: this.aggregate(record).room.viewFor(record.playerId),
    };
  }

  reconnect(record: SessionRecord) {
    this.aggregate(record).room.reconnect(record.playerId, this.options.now());
  }

  disconnect(record: SessionRecord) {
    const aggregate = this.rooms.get(record.roomCode);
    if (!aggregate) return false;
    const before = aggregate.room.viewFor(record.playerId).version;
    aggregate.room.disconnect(record.playerId, this.options.now());
    return aggregate.room.viewFor(record.playerId).version !== before;
  }

  startGame(record: SessionRecord, actionId: string, gameId: string, rounds: number) {
    return this.perform(record, actionId, { gameId, rounds }, () => {
      this.aggregate(record).room.startGame(record.playerId, gameId, { rounds }, { now: this.options.now(), rng: this.random });
    });
  }

  act(record: SessionRecord, actionId: string, action: GameAction) {
    return this.perform(record, actionId, action, () => {
      this.aggregate(record).room.act(record.playerId, action, { now: this.options.now(), rng: this.random });
    });
  }

  leave(record: SessionRecord) {
    const aggregate = this.aggregate(record);
    aggregate.room.leave(record.playerId, this.options.now());
    aggregate.sessions.delete(record.sessionId);
    this.sessionIndex.delete(record.sessionId);
    if (aggregate.sessions.size === 0) this.rooms.delete(record.roomCode);
  }

  tick() {
    const changed: string[] = [];
    for (const [code, aggregate] of this.rooms) {
      if (aggregate.room.advanceTime(this.options.now())) changed.push(code);
      if (this.options.now() - aggregate.room.updatedAt > this.roomTtlMs) {
        for (const session of aggregate.sessions.keys()) this.sessionIndex.delete(session);
        this.rooms.delete(code);
      }
    }
    return changed;
  }

  private perform(record: SessionRecord, actionId: string, payload: unknown, mutation: () => void) {
    const aggregate = this.aggregate(record);
    const key = `${record.playerId}:${actionId}`;
    const fingerprint = JSON.stringify(payload);
    const previous = aggregate.processedActions.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new DomainError('ACTION_CONFLICT', '这个操作号已经用于另一项操作');
      }
      return { version: previous.version, changed: false };
    }
    mutation();
    const version = aggregate.room.viewFor(record.playerId).version;
    aggregate.processedActions.set(key, { fingerprint, version });
    if (aggregate.processedActions.size > 2_000) {
      const oldest = aggregate.processedActions.keys().next().value;
      if (oldest) aggregate.processedActions.delete(oldest);
    }
    return { version, changed: true };
  }

  private aggregate(record: SessionRecord) {
    const aggregate = this.rooms.get(record.roomCode);
    if (!aggregate) throw new DomainError('ROOM_NOT_FOUND', '房间已经结束');
    return aggregate;
  }

  private newRecord(roomCode: string): SessionRecord {
    return { sessionId: sessionId(), playerId: playerId(), roomCode, resumeToken: secureToken() };
  }
}
