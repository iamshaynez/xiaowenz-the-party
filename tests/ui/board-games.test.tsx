import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@party/protocol';
import type { DouDizhuView, GomokuView, HoldemView, LudoView } from '@party/games';
import { GamePanel } from '../../apps/web/src/components/GamePanel';

// 3D 画布在 jsdom 中不可运行；用轻量桩替换，仅保留失败回调以便测试 DOM 降级。
const flags = vi.hoisted(() => ({ failAll: false }));
vi.mock('../../apps/web/src/components/gomoku/GomokuCanvas', () => ({
  GomokuCanvas: (props: { onFailure: () => void }) => {
    useEffect(() => { if (flags.failAll) props.onFailure(); }, []);
    return <div data-testid="gomoku-canvas-stub" />;
  },
}));
vi.mock('../../apps/web/src/components/ludo/LudoCanvas', () => ({
  LudoCanvas: (props: { onFailure: () => void }) => {
    useEffect(() => { if (flags.failAll) props.onFailure(); }, []);
    return <div data-testid="ludo-canvas-stub" />;
  },
}));
vi.mock('../../apps/web/src/components/dou-dizhu/DouDizhuCanvas', () => ({
  DouDizhuCanvas: (props: { onFailure: () => void }) => {
    useEffect(() => { if (flags.failAll) props.onFailure(); }, []);
    return <div data-testid="dou-dizhu-canvas-stub" />;
  },
}));
vi.mock('../../apps/web/src/components/texas-holdem/TexasHoldemCanvas', () => ({
  TexasHoldemCanvas: (props: { onFailure: () => void }) => {
    useEffect(() => { if (flags.failAll) props.onFailure(); }, []);
    return <div data-testid="texas-holdem-canvas-stub" />;
  },
}));

const players: RoomView['players'] = [
  { id: 'owner', nickname: '小文', avatar: '🦊', role: 'player', connected: true },
  { id: 'p2', nickname: '阿棕', avatar: '🐼', role: 'player', connected: true },
  { id: 'p3', nickname: '青蛙', avatar: '🐸', role: 'player', connected: true },
];

function roomWith(game: unknown, phase: RoomView['phase'] = 'playing'): RoomView {
  return { code: 'ABC234', phase, ownerId: 'owner', version: 3, players, game: game as never };
}

function renderPanel(game: unknown, playerId = 'owner') {
  const onAction = vi.fn();
  const onEndGame = vi.fn();
  render(
    <GamePanel
      room={roomWith(game)}
      playerId={playerId}
      onAction={onAction}
      onEndGame={onEndGame}
      pending={false}
    />,
  );
  return { onAction, onEndGame };
}

const emptyBoard = new Array<0 | 1 | null>(225).fill(null);

describe('五子棋面板', () => {
  const playing: GomokuView = {
    id: 'gomoku',
    phase: 'playing',
    round: 1,
    totalRounds: 3,
    board: [...emptyBoard],
    blackSeat: 0,
    turnSeat: 0,
    lastMove: null,
    winLine: null,
    boardWinnerId: null,
    scores: { owner: 0, p2: 0 },
    deadlineAt: Date.now() + 60_000,
    roundEndsAt: null,
    winners: [],
  };

  it('显示比分与回合状态，等待对方时不显示可落子状态', async () => {
    renderPanel({ ...playing, turnSeat: 1 }, 'owner');
    expect(await screen.findByText(/等待 阿棕 落子/)).toBeInTheDocument();
  });

  it('轮到自己提示执子颜色；盘间结果房主可推进下一盘', async () => {
    const user = userEvent.setup();
    const { onAction } = renderPanel(playing, 'owner');
    expect(await screen.findByText(/轮到你了 · 执黑/)).toBeInTheDocument();
    const roundEnd: GomokuView = { ...playing, phase: 'round-end', turnSeat: null, boardWinnerId: 'owner', scores: { owner: 1, p2: 0 }, deadlineAt: null, roundEndsAt: Date.now() + 8_000 };
    const { onAction: onNext } = renderPanel(roundEnd, 'owner');
    await user.click(screen.getByRole('button', { name: '下一盘' }));
    expect(onNext).toHaveBeenCalledWith({ type: 'next-board' });
    void onAction;
  });

  it('WebGL 不可用时降级为可访问的按钮棋盘并提交落子动作', async () => {
    flags.failAll = true;
    try {
      const user = userEvent.setup();
      const { onAction } = renderPanel(playing, 'owner');
      const cell = await screen.findByRole('gridcell', { name: '第 8 行第 8 列空位' });
      await user.click(cell);
      expect(onAction).toHaveBeenCalledWith({ type: 'place-stone', x: 7, y: 7 });
    } finally {
      flags.failAll = false;
    }
  });
});

describe('飞行棋面板', () => {
  const playing: LudoView = {
    id: 'ludo',
    phase: 'playing',
    seat: 0,
    stage: 'roll',
    dice: null,
    movablePlanes: [],
    planes: players.slice(0, 2).flatMap((_, seat) => [0, 1, 2, 3].map((index) => ({ seat, index, p: -1 }))),
    sixStreak: 0,
    lastRoll: null,
    blocked: false,
    rollDeadlineAt: Date.now() + 45_000,
    moveDeadlineAt: null,
    winnerId: null,
    rankings: [
      { playerId: 'owner', planesHome: 0, progress: 0 },
      { playerId: 'p2', planesHome: 0, progress: 0 },
    ],
  };

  it('轮到自己显示掷骰按钮并提交动作；移动阶段列出可动飞机', async () => {
    const user = userEvent.setup();
    const { onAction } = renderPanel(playing, 'owner');
    await user.click(await screen.findByRole('button', { name: /掷骰子/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'roll-dice' });

    const moving: LudoView = { ...playing, stage: 'move', dice: 6, movablePlanes: [0, 1, 2, 3], rollDeadlineAt: null, moveDeadlineAt: Date.now() + 45_000 };
    const { onAction: onMove } = renderPanel(moving, 'owner');
    await user.click(await screen.findByRole('button', { name: '2 号机起飞' }));
    expect(onMove).toHaveBeenCalledWith({ type: 'move-plane', plane: 1 });
  });

  it('终局展示排名与再来一局（仅房主）', async () => {
    const finished: LudoView = {
      ...playing,
      phase: 'finished',
      seat: null,
      stage: null,
      winnerId: 'p2',
      rollDeadlineAt: null,
      rankings: [
        { playerId: 'p2', planesHome: 4, progress: 228 },
        { playerId: 'owner', planesHome: 1, progress: 120 },
      ],
    };
    renderPanel(finished, 'owner');
    expect(await screen.findByText(/阿棕 的机队全部到家/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再来一局/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '换个游戏' })).toBeInTheDocument();
  });
});

describe('斗地主面板', () => {
  const bidding: DouDizhuView = {
    id: 'dou-dizhu',
    phase: 'bidding',
    hand: 1,
    totalHands: 3,
    scores: { owner: 0, p2: 0, p3: 0 },
    ownHand: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    handCounts: { owner: 17, p2: 17, p3: 17 },
    landlordId: null,
    bottom: null,
    bids: [],
    turnSeat: 0,
    plays: [],
    lastPlay: null,
    deadlineAt: Date.now() + 45_000,
    handEndsAt: null,
    handResult: null,
    revealedHands: null,
    winners: [],
  };

  it('叫分阶段提供 1/2/3 与不叫，低于当前最高分的按钮禁用', async () => {
    const user = userEvent.setup();
    const { onAction } = renderPanel({ ...bidding, bids: [{ playerId: 'p3', points: 2 }] }, 'owner');
    const group = await screen.findByRole('group', { name: '叫分' });
    expect(within(group).getByRole('button', { name: '不叫' })).toBeEnabled();
    expect(within(group).getByRole('button', { name: '1 分' })).toBeDisabled();
    expect(within(group).getByRole('button', { name: '3 分' })).toBeEnabled();
    await user.click(within(group).getByRole('button', { name: '3 分' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'bid', points: 3 });
  });

  it('WebGL 降级后可在文字手牌里选牌出牌', async () => {
    flags.failAll = true;
    try {
      const user = userEvent.setup();
      const playing: DouDizhuView = {
        ...bidding,
        phase: 'playing',
        landlordId: 'owner',
        turnSeat: 0,
        ownHand: [3, 16, 1, 14, 27],
        handCounts: { owner: 5, p2: 17, p3: 17 },
      };
      const { onAction } = renderPanel(playing, 'owner');
      await screen.findByRole('button', { name: '♠5' });
      // 选两张 5（牌号 3 与 16）组成对子。
      await user.click(screen.getByRole('button', { name: '♠5' }));
      await user.click(screen.getByRole('button', { name: '♥5' }));
      await user.click(screen.getByRole('button', { name: /出牌/ }));
      expect(onAction).toHaveBeenCalledWith({ type: 'play-cards', cards: expect.arrayContaining([3, 16]) });
    } finally {
      flags.failAll = false;
    }
  });

  it('结算浮层展示倍数与得分变化', async () => {
    const result: DouDizhuView = {
      ...bidding,
      phase: 'hand-result',
      turnSeat: null,
      landlordId: 'p2',
      deadlineAt: null,
      handEndsAt: Date.now() + 10_000,
      handResult: {
        winnerId: 'p2',
        landlordId: 'p2',
        landlordWins: true,
        bid: 3,
        bombs: 1,
        spring: 'none',
        multiplier: 6,
        deltas: { p2: 12, owner: -6, p3: -6 },
      },
    };
    renderPanel(result, 'owner');
    expect(await screen.findByText(/地主赢 · 叫分 3 · 炸弹 ×1/)).toBeInTheDocument();
    expect(screen.getByText(/总倍数 6/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一手' })).toBeInTheDocument();
  });
});

describe('德州扑克面板', () => {
  const preflop: HoldemView = {
    id: 'texas-holdem',
    phase: 'betting',
    handNumber: 1,
    totalHands: 3,
    blinds: { sb: 10, bb: 20 },
    street: 'preflop',
    community: [],
    ownCards: [12, 25],
    seats: [
      { playerId: 'owner', stack: 1990, streetBet: 10, committed: 10, folded: false, allIn: false },
      { playerId: 'p2', stack: 1980, streetBet: 20, committed: 20, folded: false, allIn: false },
    ],
    buttonSeat: 0,
    toActSeat: 0,
    currentBet: 20,
    minRaiseTo: 40,
    pot: 30,
    ownStack: 1990,
    ownStreetBet: 10,
    ownFolded: false,
    deadlineAt: Date.now() + 60_000,
    handEndsAt: null,
    runoutNextAt: null,
    revealed: null,
    handResult: null,
    rankings: [
      { playerId: 'owner', stack: 1980, place: 1 },
      { playerId: 'p2', stack: 1990, place: 1 },
    ],
    winners: [],
  };

  it('轮到自己提供弃牌/跟注/加注，提交对应动作', async () => {
    const user = userEvent.setup();
    const { onAction } = renderPanel(preflop, 'owner');
    await user.click(await screen.findByRole('button', { name: '弃牌' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'fold' });
    await user.click(screen.getByRole('button', { name: /跟注 10/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'call' });
    await user.click(screen.getByRole('button', { name: /加注到 40/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'raise-to', amount: 40 });
  });

  it('无人下注时显示过牌与下注；全下按钮提交全部筹码', async () => {
    const user = userEvent.setup();
    const flop: HoldemView = {
      ...preflop,
      street: 'flop',
      community: [3, 16, 29],
      toActSeat: 0,
      currentBet: 0,
      minRaiseTo: 0,
      seats: [
        { playerId: 'owner', stack: 1980, streetBet: 0, committed: 30, folded: false, allIn: false },
        { playerId: 'p2', stack: 1990, streetBet: 0, committed: 30, folded: false, allIn: false },
      ],
    };
    const { onAction } = renderPanel(flop, 'owner');
    await user.click(await screen.findByRole('button', { name: '过牌' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'check' });
    await user.click(screen.getByRole('button', { name: /^全下$/ }));
    await user.click(screen.getByRole('button', { name: /下注 1980（全下）/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'bet', amount: 1980 });
  });

  it('结算浮层展示边池归属与亮牌结果', async () => {
    const ended: HoldemView = {
      ...preflop,
      phase: 'hand-end',
      toActSeat: null,
      deadlineAt: null,
      handEndsAt: Date.now() + 9_000,
      revealed: { owner: [12, 25], p2: [1, 14] },
      handResult: {
        potWinners: [
          { amount: 5100, winnerIds: ['p2'], share: 5100 },
          { amount: 560, winnerIds: ['owner'], share: 560 },
        ],
        uncalledRefund: { playerId: 'owner', amount: 340 },
        eliminations: [],
        showdown: true,
      },
    };
    renderPanel(ended, 'owner');
    expect(await screen.findByText(/主池 5100 → 阿棕/)).toBeInTheDocument();
    expect(screen.getByText(/边池 1 560 → 小文/)).toBeInTheDocument();
    expect(screen.getByText(/未跟注 340 退回 小文/)).toBeInTheDocument();
    expect(screen.getByText(/亮牌/)).toBeInTheDocument();
  });

  it('终局排名与再来一局仅房主可用', async () => {
    const finished: HoldemView = {
      ...preflop,
      phase: 'finished',
      toActSeat: null,
      deadlineAt: null,
      handEndsAt: null,
      rankings: [
        { playerId: 'owner', stack: 3960, place: 1 },
        { playerId: 'p2', stack: 40, place: 2 },
      ],
      winners: ['owner'],
    };
    renderPanel(finished, 'p2');
    expect(await screen.findByText(/小文 拿下冠军/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /再来一局/ })).not.toBeInTheDocument();
  });
});
