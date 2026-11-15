import type { Session } from '@party/protocol';
import type { PartyServices } from './types';
import type { ProfileInput } from './types';

async function request<T>(url: string, profile?: ProfileInput): Promise<T> {
  const response = await fetch(url, profile ? {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(profile),
  } : { method: 'GET' });
  const body = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? '网络请求失败，请稍后再试');
  return body;
}

export const browserServices: PartyServices = {
  createRoom: (profile) => request<Session>('/api/rooms', profile),
  joinRoom: (code, profile) => request<Session>(`/api/rooms/${code}/join`, profile),
  connect(session, handlers) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'authenticate', sessionId: session.sessionId, resumeToken: session.resumeToken }));
    });
    socket.addEventListener('message', (event) => {
      try {
        handlers.onMessage(JSON.parse(String(event.data)) as Parameters<typeof handlers.onMessage>[0]);
      } catch {
        // Ignore malformed frames; the next valid room snapshot restores the UI.
      }
    });
    socket.addEventListener('close', handlers.onClose);
    return {
      send(message) {
        if (socket.readyState !== WebSocket.OPEN) throw new Error('正在重新连接，请稍等一下');
        socket.send(JSON.stringify(message));
      },
      close: () => socket.close(),
    };
  },
};
