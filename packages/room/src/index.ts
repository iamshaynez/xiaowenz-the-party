import { DomainError } from '@party/game-core';
import type { AnyGameDefinition, GameContext, GameRegistry, PlayerInput } from '@party/game-core';
import { gameRegistry } from '@party/games';
import { avatarSchema, nicknameSchema } from '@party/protocol';
import type { GameAction, GameViewBase, PlayerRole, PlayerView, RoomPhase, RoomView } from '@party/protocol';

interface PlayerRecord extends PlayerInput {
  role: PlayerRole;
  connected: boolean;
}

interface RunningGame {
  definition: AnyGameDefinition;
  state: unknown;
}

export interface CreateRoomOptions {
  code: string;
  owner: PlayerInput;
  now: number;
}

export class PartyRoom {
  readonly createdAt: number;
  updatedAt: number;

  private readonly players: PlayerRecord[] = [];
  private phase: RoomPhase = 'lobby';
  private ownerId: string | null;
  private version = 0;
  private runningGame: RunningGame | null = null;

  private constructor(
    readonly code: string,
    private readonly registry: GameRegistry,
    now: number,
  ) {
    this.createdAt = now;
    this.updatedAt = now;
    this.ownerId = null;
  }

  static create(options: CreateRoomOptions, registry: GameRegistry = gameRegistry) {
    const room = new PartyRoom(options.code, registry, options.now);
    room.addPlayer(options.owner, options.now);
    room.ownerId = options.owner.id;
    return room;
  }

  addPlayer(input: PlayerInput, now: number) {
    if (this.players.length >= 12) throw new DomainError('ROOM_FULL', '房间已经满员');
    if (this.players.some((player) => player.id === input.id)) {
      throw new DomainError('PLAYER_EXISTS', '玩家已经在房间中');
    }
    const nicknameResult = nicknameSchema.safeParse(input.nickname);
    const avatarResult = avatarSchema.safeParse(input.avatar);
    if (!nicknameResult.success) throw new DomainError('INVALID_NICKNAME', '昵称需要是 1–12 个字符');
    if (!avatarResult.success) throw new DomainError('INVALID_AVATAR', '请选择一个预置头像');
    const nickname = nicknameResult.data;
    if (this.players.some((player) => player.nickname.toLocaleLowerCase() === nickname.toLocaleLowerCase())) {
      throw new DomainError('NICKNAME_TAKEN', '这个昵称已经有人用了');
    }
    this.players.push({
      ...input,
      nickname,
      role: this.phase === 'lobby' ? 'player' : 'spectator',
      connected: true,
    });
    this.touch(now);
  }

  startGame(playerId: string, gameId: string, config: { rounds: number }, context: GameContext) {
    this.requireOwner(playerId);
    if (this.phase !== 'lobby') throw new DomainError('INVALID_PHASE', '游戏已经开始了');
    const definition = this.registry.get(gameId);
    if (!definition) throw new DomainError('GAME_NOT_FOUND', '没有找到这个游戏');
    if (!Number.isInteger(config.rounds) || config.rounds < 1 || config.rounds > 8) {
      throw new DomainError('INVALID_ROUNDS', '轮数需要在 1–8 之间');
    }
    const playerIds = this.players.filter((player) => player.role === 'player').map((player) => player.id);
    if (playerIds.length < definition.minPlayers) {
      throw new DomainError('NOT_ENOUGH_PLAYERS', `至少需要 ${definition.minPlayers} 位玩家`);
    }
    if (playerIds.length > definition.maxPlayers) throw new DomainError('ROOM_FULL', '玩家数量超过游戏上限');
    this.runningGame = {
      definition,
      state: definition.create({ playerIds, rounds: config.rounds, ...context }),
    };
    this.phase = 'playing';
    this.touch(context.now);
  }

  act(playerId: string, action: GameAction, context: GameContext) {
    this.requirePlayer(playerId);
    if (!this.runningGame) throw new DomainError('INVALID_PHASE', '游戏还没有开始');
    this.runningGame.definition.act(this.runningGame.state, {
      ...context,
      playerId,
      isOwner: this.ownerId === playerId,
      action,
    });
    if (this.runningGame.definition.isFinished(this.runningGame.state)) this.phase = 'finished';
    this.touch(context.now);
  }

  advanceTime(now: number) {
    if (!this.runningGame) return false;
    const changed = this.runningGame.definition.advanceTime(this.runningGame.state, now);
    if (changed) this.touch(now);
    return changed;
  }

  disconnect(playerId: string, now: number) {
    const player = this.requirePlayer(playerId);
    if (!player.connected) return;
    player.connected = false;
    this.touch(now);
  }

  reconnect(playerId: string, now: number) {
    const player = this.requirePlayer(playerId);
    if (player.connected) return;
    player.connected = true;
    this.touch(now);
  }

  leave(playerId: string, now: number) {
    this.requirePlayer(playerId);
    const index = this.players.findIndex((player) => player.id === playerId);
    this.players.splice(index, 1);
    if (this.ownerId === playerId) this.ownerId = this.players[0]?.id ?? null;
    this.touch(now);
  }

  viewFor(playerId: string): RoomView {
    this.requirePlayer(playerId);
    return {
      code: this.code,
      phase: this.phase,
      ownerId: this.ownerId,
      version: this.version,
      players: this.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        role: player.role,
        connected: player.connected,
      })),
      game: this.runningGame
        ? (this.runningGame.definition.view(this.runningGame.state, playerId) as GameViewBase)
        : null,
    };
  }

  private requirePlayer(playerId: string) {
    const player = this.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new DomainError('PLAYER_NOT_FOUND', '玩家不在这个房间中');
    return player;
  }

  private requireOwner(playerId: string) {
    this.requirePlayer(playerId);
    if (this.ownerId !== playerId) throw new DomainError('OWNER_ONLY', '只有房主可以执行这个操作');
  }

  private touch(now: number) {
    this.version += 1;
    this.updatedAt = now;
  }
}

export { DomainError } from '@party/game-core';
