import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@party/protocol';
import { Lobby } from '../../apps/web/src/components/Lobby';

const players: RoomView['players'] = [
  { id: 'owner', nickname: '小文', avatar: '🦊', role: 'player', connected: true },
  { id: 'p2', nickname: '第二位', avatar: '🐼', role: 'player', connected: true },
  { id: 'p3', nickname: '第三位', avatar: '🐸', role: 'player', connected: false },
];
const room: RoomView = { code: 'ABC234', phase: 'lobby', ownerId: 'owner', version: 1, players, game: null };

describe('派对大厅', () => {
  it('展示玩家在线状态、人数和开始条件，房主选择轮数后开局', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<Lobby room={room} playerId="owner" onStart={onStart} onLeave={vi.fn()} pending={false} />);

    expect(screen.getByText('3 / 12 位朋友')).toBeInTheDocument();
    expect(screen.getByText('暂时离线')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始游戏' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '5 轮' }));
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(onStart).toHaveBeenCalledWith('most-likely', 5);
  });

  it('房主可以切换到存钱罐，轮数选项跟随游戏变化', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<Lobby room={room} playerId="owner" onStart={onStart} onLeave={vi.fn()} pending={false} />);

    await user.click(screen.getByRole('radio', { name: /存钱罐/ }));
    expect(screen.getByText('一起往存钱罐里攒钱，砸罐的人平分。天降事件随时搅局，落幕轮保密。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4 轮' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '5 轮' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '6 轮' }));
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(onStart).toHaveBeenCalledWith('piggy-bank', 6);
  });

  it('普通玩家不能开局，会明确看到正在等待房主', () => {
    render(<Lobby room={room} playerId="p2" onStart={vi.fn()} onLeave={vi.fn()} pending={false} />);
    expect(screen.getByText('等房主开局，可以先热个身。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '开始游戏' })).not.toBeInTheDocument();
  });

  it('离开房间是可发现的操作，不需要清除浏览器数据', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(<Lobby room={room} playerId="p2" onStart={vi.fn()} onLeave={onLeave} pending={false} />);
    await user.click(screen.getByRole('button', { name: '离开房间' }));
    expect(onLeave).toHaveBeenCalled();
  });
});
