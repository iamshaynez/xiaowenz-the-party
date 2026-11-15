import { z } from 'zod';

export const AVATARS = ['🦊', '🐼', '🐸', '🐯', '🐰', '🐨', '🦁', '🐷', '🐵', '🐙', '🦄', '🐳'] as const;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const VOTING_DURATION_MS = 60_000;

export const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
export const nicknameSchema = z.string().trim().min(1).max(12);
export const avatarSchema = z.enum(AVATARS);
export const actionIdSchema = z.string().min(8).max(80);

export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cast-vote'), targetId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('next-round') }).strict(),
  z.object({ type: z.literal('play-again') }).strict(),
]);
export type GameAction = z.infer<typeof gameActionSchema>;

export const createRoomRequestSchema = z.object({
  nickname: nicknameSchema,
  avatar: avatarSchema,
}).strict();

export const joinRoomRequestSchema = createRoomRequestSchema.extend({
  resumeToken: z.string().min(20).max(200).optional(),
}).strict();

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('authenticate'), sessionId: z.string().min(10).max(100), resumeToken: z.string().min(20).max(200) }).strict(),
  z.object({ type: z.literal('start-game'), actionId: actionIdSchema, gameId: z.literal('most-likely'), rounds: z.number().int().min(1).max(8) }).strict(),
  z.object({ type: z.literal('game-action'), actionId: actionIdSchema, action: gameActionSchema }).strict(),
  z.object({ type: z.literal('leave-room'), actionId: actionIdSchema }).strict(),
  z.object({ type: z.literal('ping') }).strict(),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type PlayerRole = 'player' | 'spectator';
export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface PlayerView {
  id: string;
  nickname: string;
  avatar: string;
  role: PlayerRole;
  connected: boolean;
}

export interface GameViewBase {
  id: string;
}

export interface RoomView<TGame extends GameViewBase = GameViewBase> {
  code: string;
  phase: RoomPhase;
  ownerId: string | null;
  version: number;
  players: PlayerView[];
  game: TGame | null;
}

export interface Session {
  sessionId: string;
  playerId: string;
  roomCode: string;
  resumeToken: string;
  room: RoomView;
}

export type ServerMessage =
  | { type: 'ready'; session: Session }
  | { type: 'room'; room: RoomView }
  | { type: 'action-ack'; actionId: string; version: number }
  | { type: 'error'; code: string; message: string; actionId?: string }
  | { type: 'pong'; now: number };
