import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RoomService, RoomServiceSnapshot } from './room-service';

export class RoomPersistence {
  private timer: NodeJS.Timeout | undefined;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly rooms: RoomService,
    private readonly filePath: string,
    private readonly onError: (error: unknown) => void,
  ) {}

  async load() {
    let contents: string;
    try {
      contents = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.rooms.setChangeListener(() => this.schedule());
        return;
      }
      throw error;
    }
    const snapshot = JSON.parse(contents) as RoomServiceSnapshot;
    this.rooms.restore(snapshot);
    this.rooms.setChangeListener(() => this.schedule());
  }

  schedule() {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, 20);
    this.timer.unref();
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const snapshot = this.rooms.snapshot();
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.filePath);
    }).catch((error) => {
      this.onError(error);
    });
    await this.queue;
  }

  async close() {
    this.closed = true;
    await this.flush();
  }
}
