import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@party/protocol';
import type { MostLikelyView } from '../../apps/web/src/types';
import { GamePanel } from '../../apps/web/src/components/GamePanel';

const players: RoomView['players'] = [
  { id: 'owner', nickname: '小文', avatar: '🦊', role: 'player', connected: true },
  { id: 'p2', nickname: '第二位', avatar: '🐼', role: 'player', connected: true },
  { id: 'p3', nickname: '第三位', avatar: '🐸', role: 'player', connected: true },
];

const votingGame: MostLikelyView = {
  id: 'most-likely',
  phase: 'voting',
  round: 1,
  totalRounds: 3,
  prompt: '谁最可能半夜突然想吃火锅？',
  submittedPlayerIds: [],
  ownVote: null,
  deadlineAt: Date.now() + 60_000,
  scores: { owner: 0, p2: 0, p3: 0 },
  results: null,
  winners: [],
};

function roomWith(game: MostLikelyView): RoomView {
  return { code: 'ABC234', phase: 'playing', ownerId: 'owner', version: 2, players, game };
}

describe('谁最可能：手机投票与揭晓', () => {
  it('玩家只能投其他参与者，点击后提交明确的游戏动作', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<GamePanel room={roomWith(votingGame)} playerId="owner" onAction={onAction} pending={false} />);

    expect(screen.getByRole('heading', { name: votingGame.prompt })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '投给 小文' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '投给 第二位' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'cast-vote', targetId: 'p2' });
  });

  it('其他玩家已提交只显示完成状态，不泄露投给了谁', () => {
    render(<GamePanel room={roomWith({ ...votingGame, submittedPlayerIds: ['p2'] })} playerId="owner" onAction={vi.fn()} pending={false} />);
    expect(screen.getByText('1 / 3 已投票')).toBeInTheDocument();
    expect(screen.queryByText(/第二位.*小文/)).not.toBeInTheDocument();
  });

  it('揭晓后展示票型和焦点玩家，房主可以推进下一轮', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const game: MostLikelyView = {
      ...votingGame,
      phase: 'results',
      deadlineAt: null,
      results: {
        votes: { owner: 'p2', p2: 'owner', p3: 'p2' },
        counts: { owner: 1, p2: 2, p3: 0 },
        winners: ['p2'],
      },
      scores: { owner: 0, p2: 1, p3: 0 },
    };
    render(<GamePanel room={roomWith(game)} playerId="owner" onAction={onAction} pending={false} />);

    expect(screen.getByText('全场焦点')).toBeInTheDocument();
    expect(screen.getAllByText('第二位').length).toBeGreaterThan(0);
    expect(screen.getByText('2 票')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一轮' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'next-round' });
  });

  it('最终总结展示冠军，非房主不会看到再来一局按钮', () => {
    const game: MostLikelyView = {
      ...votingGame,
      phase: 'finished',
      deadlineAt: null,
      scores: { owner: 1, p2: 2, p3: 0 },
      winners: ['p2'],
    };
    render(<GamePanel room={roomWith(game)} playerId="p3" onAction={vi.fn()} pending={false} />);
    expect(screen.getByText('今晚的气氛担当')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再来一局' })).not.toBeInTheDocument();
  });
});
