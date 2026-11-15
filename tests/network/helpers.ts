import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@party/protocol';

export class PartyTestClient {
  readonly messages: ServerMessage[] = [];
  private readonly waiters = new Set<() => void>();

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()) as ServerMessage);
      this.notify();
    });
    socket.on('close', () => this.notify());
  }

  static async connect(url: string) {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return new PartyTestClient(socket);
  }

  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(message: string) {
    this.socket.send(message);
  }

  async waitForError(code: string) {
    const message = await this.waitForMessage((candidate) => candidate.type === 'error' && candidate.code === code);
    if (message.type !== 'error') throw new Error('预期错误消息');
    return message;
  }

  async waitFor<T extends ServerMessage['type']>(type: T, timeoutMs = 2_000) {
    return this.waitForMessage((message) => message.type === type, timeoutMs) as Promise<Extract<ServerMessage, { type: T }>>;
  }

  async waitForMessage(predicate: (message: ServerMessage) => boolean, timeoutMs = 2_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const found = this.messages.find(predicate);
      if (found) return found;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 20);
        const waiter = () => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve();
        };
        this.waiters.add(waiter);
      });
    }
    throw new Error(`等待消息超时：${JSON.stringify(this.messages)}`);
  }

  clear() {
    this.messages.length = 0;
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>((resolve) => this.socket.once('close', () => resolve()));
    this.socket.close();
    await closed;
  }

  private notify() {
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }
}
