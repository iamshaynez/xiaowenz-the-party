import { render, screen, within, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MonsterCarBuild, RoomView } from '@party/protocol';
import { createMonsterCarRacePlan, RACE_DURATION_MS, sampleMonsterCarFrame } from '@party/games';
import type { MonsterCarRaceFrame, MonsterCarRacePlan, MonsterCarView } from '../../apps/web/src/types';
import { GamePanel } from '../../apps/web/src/components/GamePanel';

const renderingControl = vi.hoisted(() => ({ fail: false }));
const thumbnailControl = vi.hoisted(() => ({ fail: false }));

vi.mock('../../apps/web/src/components/monster-car/PartThumbnail', () => ({
  PartThumbnail({ slot, partId, fallbackEmoji }: { slot: string; partId: string; fallbackEmoji: string }) {
    return <span data-testid={`part-thumbnail-${slot}-${partId}`} data-state={thumbnailControl.fail ? 'fallback' : 'loaded'}>{thumbnailControl.fail ? fallbackEmoji : ''}</span>;
  },
}));

vi.mock('../../apps/web/src/components/monster-car/MonsterCarCanvas', async () => {
  const { useEffect } = await import('react');
  const { sampleMonsterCarFrame } = await import('@party/games');

  return {
    MonsterCarCanvas({ game, previewBuild, onFrame, onFailure }: {
      game: MonsterCarView;
      previewBuild: MonsterCarBuild;
      onFrame: (frame: MonsterCarRaceFrame) => void;
      onFailure: () => void;
    }) {
      useEffect(() => {
        if (renderingControl.fail) {
          onFailure();
          return;
        }
        if (!game.plan || (game.phase !== 'racing' && game.phase !== 'finished')) return;
        const firstCueAtMs = game.plan.racers[0]?.cues[0]?.startAtMs ?? 0;
        const atMs = game.phase === 'finished' ? game.plan.durationMs : firstCueAtMs + 1;
        onFrame(sampleMonsterCarFrame(game.plan, atMs));
      }, [game.phase, game.plan, onFailure, onFrame]);

      return (
        <div
          data-testid="monster-car-canvas"
          data-phase={game.phase}
          data-preview-build={JSON.stringify(previewBuild)}
        />
      );
    },
  };
});

const players: RoomView['players'] = [
  { id: 'owner', nickname: '小文', avatar: '🦊', role: 'player', connected: true },
  { id: 'p2', nickname: '第二位', avatar: '🐼', role: 'player', connected: true },
  { id: 'p3', nickname: '第三位', avatar: '🐸', role: 'player', connected: true },
];
const participantIds = players.map((player) => player.id);
const defaultBuild: MonsterCarBuild = {
  wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear',
};
const builds: Record<string, MonsterCarBuild> = {
  owner: defaultBuild,
  p2: { ...defaultBuild, wheels: 'donut', driver: 'frog' },
  p3: { ...defaultBuild, front: 'duck', rear: 'rocket' },
};

const buildingGame: MonsterCarView = {
  id: 'monster-car',
  phase: 'building',
  participantIds,
  builds,
  readyPlayerIds: [],
  buildingDeadlineAt: Date.now() + 120_000,
  raceStartsAt: null,
  raceEndsAt: null,
  plan: null,
  standings: [],
};

// 与网络快照一样经过 JSON 往返，确保 UI 测试只依赖可序列化的赛事数据。
const racePlan = JSON.parse(JSON.stringify(createMonsterCarRacePlan({
  playerIds: participantIds,
  builds,
  seed: 20_261_117,
  now: 50_000,
}))) as MonsterCarRacePlan;

const countdownGame: MonsterCarView = {
  ...buildingGame,
  phase: 'countdown',
  readyPlayerIds: [...participantIds],
  raceStartsAt: 53_000,
  raceEndsAt: 83_000,
  plan: racePlan,
};
const racingGame: MonsterCarView = {
  ...countdownGame,
  phase: 'racing',
};
const finishedGame: MonsterCarView = {
  ...countdownGame,
  phase: 'finished',
  standings: racePlan.finishOrder.map((playerId, index) => {
    const racer = racePlan.racers.find((entry) => entry.playerId === playerId);
    if (!racer) throw new Error(`测试赛事缺少玩家 ${playerId}`);
    return { playerId, place: index + 1, finishAtMs: racer.finishAtMs, highlight: racer.highlight };
  }),
};

function roomWith(game: MonsterCarView, roomPlayers: RoomView['players'] = players): RoomView {
  return { code: 'ABC234', phase: 'playing', ownerId: 'owner', version: 4, players: roomPlayers, game };
}

async function renderPanel(
  game: MonsterCarView,
  playerId = 'owner',
  pending = false,
  onAction = vi.fn(),
  roomPlayers: RoomView['players'] = players,
) {
  const result = render(<GamePanel room={roomWith(game, roomPlayers)} playerId={playerId} onAction={onAction} pending={pending} />);
  await screen.findByTestId('monster-car-canvas');
  return result;
}

afterEach(() => {
  renderingControl.fail = false;
  thumbnailControl.fail = false;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('怪兽汽车：组装、竞演与终局', () => {
  it('GamePanel 经 lazy/Suspense 打开车库，部位与零件选择会提交完整 build-car 动作', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    await renderPanel(buildingGame, 'owner', false, onAction);

    expect(screen.getByRole('heading', { name: /奇怪的车/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /轮子/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('radio', { name: /甜甜圈轮/ }));
    expect(screen.getByRole('radio', { name: /甜甜圈轮/ })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('tab', { name: /车顶/ }));
    expect(screen.getByRole('radiogroup', { name: '选择车顶' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /雨伞车顶/ }));
    expect(screen.getByRole('radio', { name: /雨伞车顶/ })).toHaveAttribute('aria-checked', 'true');

    const expectedBuild: MonsterCarBuild = { ...defaultBuild, wheels: 'donut', roof: 'umbrella' };
    expect(screen.getByTestId('monster-car-canvas')).toHaveAttribute('data-preview-build', JSON.stringify(expectedBuild));
    await user.click(screen.getByRole('button', { name: '我的车好了！出发' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ type: 'build-car', build: expectedBuild });
  });

  it('出发按钮有移动端隐藏文案后仍稳定的可访问名称，pending 时禁用且不重复提交', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    await renderPanel(buildingGame, 'owner', true, onAction);

    const submit = screen.getByRole('button', { name: '我的车好了！出发' });
    expect(submit).toHaveAccessibleName('我的车好了！出发');
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('全员准备后展示倒数与森林道路，不再显示组装控件', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000);
    await renderPanel(countdownGame);

    expect(screen.getByText('准备出发')).toBeInTheDocument();
    expect(screen.getByText('握紧方向盘')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('怪兽汽车，准备出发！')).toBeInTheDocument();
    expect(screen.getByText('2–4 辆车 · 同一条森林道路')).toBeInTheDocument();
    expect(screen.getByLabelText('森林道路进度')).toBeInTheDocument();
    expect(screen.getByTestId('monster-car-canvas')).toHaveAttribute('data-phase', 'countdown');
    expect(screen.queryByRole('tablist', { name: '汽车部位' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /我的车好了/ })).not.toBeInTheDocument();
  });

  it('竞演 HUD 使用赛事帧展示剩余秒数、自己的名次、道路车辆与零件高光', async () => {
    const firstCueAtMs = racePlan.racers[0]?.cues[0]?.startAtMs ?? 0;
    const expectedFrame = sampleMonsterCarFrame(racePlan, firstCueAtMs + 1);
    const ownCar = expectedFrame.cars.find((car) => car.playerId === 'owner');
    if (!ownCar?.activeCue) throw new Error('测试帧应包含自己的反应高光');
    await renderPanel(racingGame);

    expect(await screen.findByText(`我的车在第 ${ownCar.place} 位`)).toBeInTheDocument();
    const secondsLeft = Math.max(0, Math.ceil((RACE_DURATION_MS - expectedFrame.atMs) / 1_000));
    expect(screen.getByText(`森林旅行 · ${secondsLeft} 秒`)).toBeInTheDocument();
    expect(screen.getByText(ownCar.activeCue.primary.highlight)).toBeInTheDocument();
    const route = screen.getByLabelText('森林道路进度');
    expect(within(route).getByTitle('小文')).toBeInTheDocument();
    expect(route.querySelectorAll('.mc-route-car')).toHaveLength(participantIds.length);
    expect(screen.getByTestId('monster-car-canvas')).toHaveAttribute('data-phase', 'racing');
  });

  it('终局按赛事顺序展示名次与高光，房主可以精确提交 play-again', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const firstPlayerId = racePlan.finishOrder[0]!;
    const firstRacer = racePlan.racers.find((racer) => racer.playerId === firstPlayerId)!;
    const firstPlayer = players.find((player) => player.id === firstPlayerId)!;
    await renderPanel(finishedGame, 'owner', false, onAction);

    const results = screen.getByRole('region', { name: '抵达云朵大操场！' });
    expect(results.querySelectorAll('.mc-standings > div')).toHaveLength(participantIds.length);
    const firstRow = within(results).getByText(firstPlayer.nickname).closest('.mc-standings > div');
    if (!firstRow) throw new Error('终局应展示第一名所在行');
    expect(within(firstRow as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(firstRow as HTMLElement).getByText(firstRacer.highlight)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '再造一辆，重新出发' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ type: 'play-again' });
  });

  it('非房主能看到完整终局，但不能再来一局', async () => {
    await renderPanel(finishedGame, 'p2');

    expect(screen.getByRole('region', { name: '抵达云朵大操场！' })).toBeInTheDocument();
    expect(screen.getByText('等房主再开一场森林旅行')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再造一辆，重新出发' })).not.toBeInTheDocument();
  });

  it('旁观者可以观看车辆，但没有部位、零件或出发操作', async () => {
    const spectatorPlayers: RoomView['players'] = [
      ...players,
      { id: 'spectator', nickname: '围观者', avatar: '🐨', role: 'spectator', connected: true },
    ];
    const onAction = vi.fn();
    await renderPanel(buildingGame, 'spectator', false, onAction, spectatorPlayers);

    expect(screen.getByText('观战车辆')).toBeInTheDocument();
    expect(screen.getByText('你正在观战。坐好，看看大家造出了什么车！')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '汽车部位' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: '选择轮子' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '我的车好了！出发' })).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('部位与零件支持方向键和 Home/End，保持完整键盘操作契约', async () => {
    const user = userEvent.setup();
    await renderPanel(buildingGame);
    const wheelsTab = screen.getByRole('tab', { name: /轮子/ });
    wheelsTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /车头/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /车头/ })).toHaveFocus();

    const smile = screen.getByRole('radio', { name: /微笑车头/ });
    smile.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: /鸭鸭船头/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /鸭鸭船头/ })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(smile).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /鲨鱼车头/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('旁观者会持续看到公开车辆的最新改装', async () => {
    const spectatorPlayers: RoomView['players'] = [
      ...players,
      { id: 'spectator', nickname: '围观者', avatar: '🐨', role: 'spectator', connected: true },
    ];
    const result = await renderPanel(buildingGame, 'spectator', false, vi.fn(), spectatorPlayers);
    const updatedGame: MonsterCarView = {
      ...buildingGame,
      builds: { ...builds, owner: { ...defaultBuild, wheels: 'spring' } },
    };
    result.rerender(<GamePanel room={roomWith(updatedGame, spectatorPlayers)} playerId="spectator" onAction={vi.fn()} pending={false} />);
    await waitFor(() => expect(screen.getByTestId('monster-car-canvas')).toHaveAttribute('data-preview-build', JSON.stringify(updatedGame.builds.owner)));
  });

  it('WebGL 失败时仍用同一纯函数更新路线、剩余时间和自己的名次', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(58_000);
    renderingControl.fail = true;
    const expected = sampleMonsterCarFrame(racePlan, 5_000);
    const ownCar = expected.cars.find((car) => car.playerId === 'owner');
    if (!ownCar) throw new Error('降级测试缺少自己的车辆');
    render(<GamePanel room={roomWith(racingGame)} playerId="owner" onAction={vi.fn()} pending={false} />);

    expect(await screen.findByText(`我的车在第 ${ownCar.place} 位`)).toBeInTheDocument();
    expect(screen.getByText('森林旅行 · 25 秒')).toBeInTheDocument();
    expect(screen.getByLabelText('森林道路进度').querySelectorAll('.mc-route-car')).toHaveLength(participantIds.length);
    expect(document.querySelector('.mc-dom-journey')).toBeInTheDocument();
    expect(screen.queryByTestId('monster-car-canvas')).not.toBeInTheDocument();
  });

  it('模型货架展示八个真实缩略图，加载失败也保留可选的回退控件', async () => {
    await renderPanel(buildingGame);
    const thumbnails = document.querySelectorAll('.mc-part-options [data-testid^="part-thumbnail-"]');
    expect(thumbnails).toHaveLength(8);
    expect(Array.from(thumbnails).every((node) => node.getAttribute('data-state') === 'loaded')).toBe(true);
  });

  it('缩略图失败时仍可通过模型名称选择并提交零件', async () => {
    thumbnailControl.fail = true;
    const user = userEvent.setup();
    const onAction = vi.fn();
    await renderPanel(buildingGame, 'owner', false, onAction);
    expect(screen.getByTestId('part-thumbnail-wheels-banana')).toHaveAttribute('data-state', 'fallback');
    await user.click(screen.getByRole('radio', { name: /香蕉轮/ }));
    await user.click(screen.getByRole('button', { name: '我的车好了！出发' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'build-car', build: { ...defaultBuild, wheels: 'banana' } });
  });

  it('终点名次自动收起为庆典条，并可重新展开而不影响车辆庆典', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderPanel(finishedGame);
    expect(screen.getByRole('region', { name: '抵达云朵大操场！' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByRole('region', { name: '抵达云朵大操场！' })).not.toBeInTheDocument();
    expect(screen.getByText('欢乐车阵 · 礼花庆典')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看名次' }));
    expect(screen.getByRole('region', { name: '抵达云朵大操场！' })).toBeInTheDocument();
  });

  it('手动展开名次会取消旧的自动收起计时器', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderPanel(finishedGame);
    await act(() => vi.advanceTimersByTime(2_000));
    fireEvent.click(screen.getByRole('button', { name: '看车车和礼花' }));
    fireEvent.click(screen.getByRole('button', { name: '查看名次' }));
    await act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('region', { name: '抵达云朵大操场！' })).toBeInTheDocument();
  });
});
