import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@party/protocol';
import type { PiggyBankView } from '../../apps/web/src/types';
import { GamePanel } from '../../apps/web/src/components/GamePanel';

const players: RoomView['players'] = [
  { id: 'owner', nickname: '小文', avatar: '🦊', role: 'player', connected: true },
  { id: 'p2', nickname: '第二位', avatar: '🐼', role: 'player', connected: true },
  { id: 'p3', nickname: '第三位', avatar: '🐸', role: 'player', connected: true },
];

const choosingGame: PiggyBankView = {
  id: 'piggy-bank',
  phase: 'choosing',
  round: 2,
  roundsRange: [3, 5],
  pot: 9,
  event: null,
  ownHammers: 2,
  hammers: { owner: 2, p2: 2, p3: 1 },
  ownChoice: null,
  submittedPlayerIds: ['p2'],
  deadlineAt: Date.now() + 30_000,
  coins: { owner: 3, p2: 1, p3: 0 },
  lastRound: null,
  finalSplit: 0,
  winners: [],
};

function roomWith(game: PiggyBankView): RoomView {
  return { code: 'ABC234', phase: 'playing', ownerId: 'owner', version: 3, players, game };
}

describe('存钱罐：手机抉择与揭晓', () => {
  it('展示罐中金额，点击守护或砸罐提交明确的游戏动作', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<GamePanel room={roomWith(choosingGame)} playerId="owner" onAction={onAction} onEndGame={vi.fn()} pending={false} />);

    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('枚金币')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === '1 / 3 已决定')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '守护罐子' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'choose', choice: 'guard' });
    await user.click(screen.getByRole('button', { name: '打破罐子拿走 9 枚' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'choose', choice: 'smash' });
  });

  it('烫手罐提示只许拿走一半', () => {
    render(<GamePanel room={roomWith({ ...choosingGame, event: 'hot' })} playerId="owner" onAction={vi.fn()} onEndGame={vi.fn()} pending={false} />);
    expect(screen.getByText('🔥 烫手罐 · 这轮砸罐只能拿走一半')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打破罐子拿走 4 枚' })).toBeInTheDocument();
  });

  it('盲罐轮隐藏罐中金额', () => {
    render(<GamePanel room={roomWith({ ...choosingGame, event: 'blind', pot: null })} playerId="owner" onAction={vi.fn()} onEndGame={vi.fn()} pending={false} />);
    expect(screen.getByText('🌀 盲罐轮 · 黑暗中投币，罐里金额保密')).toBeInTheDocument();
    expect(screen.getByText('金额保密')).toBeInTheDocument();
    expect(screen.queryByText('枚金币')).not.toBeInTheDocument();
  });

  it('锤子用完后不再展示选择按钮，只提示自动守护', () => {
    render(<GamePanel room={roomWith({ ...choosingGame, ownHammers: 0, hammers: { owner: 0, p2: 2, p3: 1 } })} playerId="owner" onAction={vi.fn()} onEndGame={vi.fn()} pending={false} />);
    expect(screen.getByText('🔨 你的锤子用完了，这几轮自动守护，坐等终局平分。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '守护罐子' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /打破罐子/ })).not.toBeInTheDocument();
  });

  it('揭晓轮展示谁砸了罐和各自的进账，纸糊罐有大戏', () => {
    const game: PiggyBankView = {
      ...choosingGame,
      phase: 'reveal',
      deadlineAt: Date.now() + 8_000,
      lastRound: {
        round: 2,
        event: 'paper',
        smashers: ['owner'],
        payouts: { p2: 1, p3: 1 },
        potBefore: 6,
        potAfter: 6,
        blindBonus: 0,
      },
    };
    render(<GamePanel room={roomWith(game)} playerId="owner" onAction={vi.fn()} onEndGame={vi.fn()} pending={false} />);

    expect(screen.getByText('🃏 纸糊罐！')).toBeInTheDocument();
    expect(screen.getByText('小文 砸了个寂寞')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.classList.contains('pb-pot-line') === true && element.textContent === '罐子 6 → 6 枚')).toBeInTheDocument();
    expect(screen.getAllByText('+1').length).toBe(2);
    expect(screen.getByText('+0')).toBeInTheDocument();
  });

  it('终局展示金币排行与终局平分，非房主看不到再来一局', () => {
    const game: PiggyBankView = {
      ...choosingGame,
      phase: 'finished',
      deadlineAt: null,
      coins: { owner: 5, p2: 3, p3: 3 },
      finalSplit: 2,
      winners: ['owner'],
    };
    render(<GamePanel room={roomWith(game)} playerId="p2" onAction={vi.fn()} onEndGame={vi.fn()} pending={false} />);

    expect(screen.getByText('今晚的存钱罐之王')).toBeInTheDocument();
    expect(screen.getByText('终局信任加成：剩下的罐子每人分得 2 枚')).toBeInTheDocument();
    expect(screen.getByText('5 金币')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再来一局' })).not.toBeInTheDocument();
  });
});
