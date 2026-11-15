import type { ClientMessage, ServerMessage, Session } from '@party/protocol';

export interface ProfileInput {
  nickname: string;
  avatar: string;
}

export interface ConnectionHandlers {
  onMessage: (message: ServerMessage) => void;
  onClose: () => void;
}

export interface PartyConnection {
  send: (message: ClientMessage) => void;
  close: () => void;
}

export interface PartyServices {
  createRoom: (profile: ProfileInput) => Promise<Session>;
  joinRoom: (code: string, profile: ProfileInput) => Promise<Session>;
  connect: (session: Session, handlers: ConnectionHandlers) => PartyConnection;
}
