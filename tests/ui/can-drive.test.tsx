import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@party/protocol';
import type { CanDriveView } from '@party/games';
import { CanDrivePanel } from '../../apps/web/src/games/can-drive/CanDrivePanel';

vi.mock('../../apps/web/src/games/can-drive/CarGameViewport', () => ({
  CarGameViewport: ({ mode }: { mode: string }) => <div data-testid="car-viewport">{mode}</div>,
}));

const players: RoomView['players'] = [
  { id: 'owner', nickname: '小文', avatar: '🦊', role: 'player', connected: true },
  { id: 'p2', nickname: '第二位', avatar: '🐼', role: 'player', connected: true },
];
const defaultBuild = { driver: 'cat', motion: 'square-wheels', front: 'pillow', rear: 'rocket', roof: 'umbrella' } as const;
const buildingGame: CanDriveView = {
  id: 'can-drive',
  phase: 'building',
  round: 1,
  totalCars: 2,
  orderPlayerIds: ['owner', 'p2'],
  ownBuild: defaultBuild,
  ownReady: false,
  readyPlayerIds: [],
  buildDeadlineAt: Date.now() + 120_000,
  current: null,
  awards: [],
  finalCars: [],
};

function roomWith(game: CanDriveView): RoomView {
  return { code: 'CAR123', phase: game.phase === 'finished' ? 'finished' : 'playing', ownerId: 'owner', version: 1, players, game };
}

describe('「这车能开？」组装与颁奖界面', () => {
  it('五个部位都能选择零件，准备动作交给服务端', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<CanDrivePanel room={roomWith(buildingGame)} playerId="owner" onAction={onAction} pending={false} />);

    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: /^司机：/ })).toHaveLength(8);
    await user.click(screen.getByRole('button', { name: '司机：机器人司机' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'select-car-part', slot: 'driver', partId: 'robot' });

    await user.click(screen.getByRole('tab', { name: '车顶' }));
    await user.click(screen.getByRole('button', { name: '车顶：车顶花盆' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'select-car-part', slot: 'roof', partId: 'flowerpot' });

    await user.click(screen.getByRole('button', { name: '准备好了' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'submit-car' });
  });

  it('已准备后仍允许改装，并明确提示改装会取消准备', () => {
    render(<CanDrivePanel room={roomWith({ ...buildingGame, ownReady: true, readyPlayerIds: ['owner'] })} playerId="owner" onAction={vi.fn()} pending={false} />);
    expect(screen.getByRole('button', { name: '等待其他朋友' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '司机：机器人司机' })).toBeEnabled();
    expect(screen.getByText('想再改也可以，改装会重新取消准备。')).toBeInTheDocument();
  });

  it('合影展示每辆车的搞笑奖，只有房主可以保留车辆重开', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const awards = [
      { playerId: 'owner', awardId: 'air-time', name: '空中滞留奖', icon: '☁️', description: '这辆车看起来不太需要地面。' },
      { playerId: 'p2', awardId: 'quiet-no', name: '安静不了一点奖', icon: '📣', description: '整条测试道都听见了。' },
    ];
    const game: CanDriveView = {
      ...buildingGame,
      phase: 'finished',
      buildDeadlineAt: null,
      awards,
      finalCars: awards.map((award) => ({ ...award, build: defaultBuild })),
    };
    const { rerender } = render(<CanDrivePanel room={roomWith(game)} playerId="p2" onAction={onAction} pending={false} />);
    expect(screen.getByText('每辆车，都有自己的节目。')).toBeInTheDocument();
    expect(screen.getByText('空中滞留奖')).toBeInTheDocument();
    expect(screen.getByText('安静不了一点奖')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保留车辆，再改一局' })).not.toBeInTheDocument();

    rerender(<CanDrivePanel room={roomWith(game)} playerId="owner" onAction={onAction} pending={false} />);
    await user.click(screen.getByRole('button', { name: '保留车辆，再改一局' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'play-again' });
  });
});
