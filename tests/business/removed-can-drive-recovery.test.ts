import { describe, expect, it } from 'vitest';
import { PartyRoom } from '@party/room';
import { RoomService } from '../../apps/server/src/rooms/room-service';

function snapshotWithRemovedGame(version: number) {
  const room = PartyRoom.create({ code: 'CAR123', owner: { id: 'owner', nickname: '房主', avatar: '🦊' }, now: 1_000 });
  const snapshot = room.snapshot();
  snapshot.phase = 'playing';
  snapshot.game = { id: 'can-drive', version, state: {} };
  return snapshot;
}

describe('已移除车辆游戏的快照恢复', () => {
  for (const version of [1, 2]) {
    it(`can-drive v${version} 快照被明确跳过且不影响服务启动`, () => {
      const warnings: string[] = [];
      const service = new RoomService({ now: () => 5_000, onWarning: (message) => warnings.push(message) });
      service.restore({
        schemaVersion: 1,
        rooms: [{ room: snapshotWithRemovedGame(version), sessions: [], processedActions: [] }],
      });
      expect(service.activeRooms).toBe(0);
      expect(warnings).toEqual(['Skipping removed can-drive room snapshot']);
    });
  }

  it('其他未知游戏版本仍然明确拒绝', () => {
    const service = new RoomService({ now: () => 5_000 });
    const snapshot = snapshotWithRemovedGame(99);
    snapshot.game!.id = 'other-removed-game';
    expect(() => service.restore({
      schemaVersion: 1,
      rooms: [{ room: snapshot, sessions: [], processedActions: [] }],
    })).toThrowError(expect.objectContaining({ code: 'SNAPSHOT_INCOMPATIBLE' }));
  });
});
