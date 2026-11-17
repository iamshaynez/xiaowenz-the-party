import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, GameAction, GameId, RoomView, Session } from '@party/protocol';
import type { PartyConnection, PartyServices, ProfileInput } from '../services/types';

const storageKey = (code: string) => `party.session.${code}`;
const actionId = () => `web-${crypto.randomUUID()}`;

function storedSession(code: string) {
  try {
    const value = window.localStorage.getItem(storageKey(code));
    return value ? JSON.parse(value) as Session : null;
  } catch {
    return null;
  }
}

export function usePartyRoom(code: string, services: PartyServices) {
  const [session, setSession] = useState<Session | null>(() => storedSession(code));
  const [room, setRoom] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting'>('idle');
  const [pending, setPending] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const connectionRef = useRef<PartyConnection | null>(null);
  const pingSentAtRef = useRef(0);

  useEffect(() => {
    if (!session) {
      setStatus('idle');
      return;
    }
    let active = true;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (!active) return;
      setStatus(retry === 0 ? 'connecting' : 'reconnecting');
      const connection = services.connect(session, {
        onMessage(message) {
          if (!active) return;
          if (message.type === 'ready') {
            retry = 0;
            setStatus('connected');
            setRoom(message.session.room);
            setError(null);
            pingSentAtRef.current = Date.now();
            connectionRef.current?.send({ type: 'ping' });
          } else if (message.type === 'room') {
            setRoom((previous) => !previous || message.room.version >= previous.version ? message.room : previous);
          } else if (message.type === 'pong') {
            const receivedAt = Date.now();
            const roundTripMs = Math.max(0, receivedAt - pingSentAtRef.current);
            setServerClockOffsetMs(message.now + roundTripMs / 2 - receivedAt);
          } else if (message.type === 'action-ack') {
            setPending(false);
          } else if (message.type === 'error') {
            setPending(false);
            setError(message.message);
            if (message.code === 'AUTH_FAILED' || message.code === 'ROOM_NOT_FOUND') {
              window.localStorage.removeItem(storageKey(code));
              setSession(null);
            }
          }
        },
        onClose() {
          if (!active) return;
          setStatus('reconnecting');
          const delay = Math.min(5_000, 400 * 2 ** retry) + Math.random() * 150;
          retry += 1;
          retryTimer = setTimeout(connect, delay);
        },
      });
      connectionRef.current = connection;
    };
    connect();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      connectionRef.current?.close();
      connectionRef.current = null;
    };
  }, [code, services, session]);

  const send = useCallback((message: ClientMessage) => {
    try {
      setPending(true);
      setError(null);
      connectionRef.current?.send(message);
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : '发送失败，请稍后重试');
    }
  }, []);

  return {
    session,
    room,
    playerId: session?.playerId ?? '',
    status,
    pending,
    joining,
    error,
    serverClockOffsetMs,
    async join(profile: ProfileInput) {
      setJoining(true);
      setError(null);
      try {
        const joined = await services.joinRoom(code, profile);
        window.localStorage.setItem(storageKey(code), JSON.stringify(joined));
        setSession(joined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '加入失败，请稍后重试');
      } finally {
        setJoining(false);
      }
    },
    start(gameId: GameId, rounds: number) {
      send({ type: 'start-game', actionId: actionId(), gameId, rounds });
    },
    act(action: GameAction) {
      send({ type: 'game-action', actionId: actionId(), action });
    },
    leave() {
      send({ type: 'leave-room', actionId: actionId() });
      window.localStorage.removeItem(storageKey(code));
      setSession(null);
      setRoom(null);
    },
  };
}

export function saveSession(session: Session) {
  window.localStorage.setItem(storageKey(session.roomCode), JSON.stringify(session));
}
