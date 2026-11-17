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

  it('房主在首页选过的游戏会成为大厅默认选项', () => {
    window.localStorage.setItem('party.game.ABC234', 'piggy-bank');
    render(<Lobby room={room} playerId="owner" onStart={vi.fn()} onLeave={vi.fn()} pending={false} />);
    expect(screen.getByRole('radio', { name: /存钱罐/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: '4 轮' }).className).toContain('is-active');
    expect(screen.getByText('家庭')).toBeInTheDocument();
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

  it('房主可以选择怪兽汽车，单场开局且没有轮数选择', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<Lobby room={room} playerId="owner" onStart={onStart} onLeave={vi.fn()} pending={false} />);

    await user.click(screen.getByRole('radio', { name: /怪兽汽车/ }));
    expect(screen.getByText('装出全世界独一无二的怪车，一起穿过会互动的魔法森林。')).toBeInTheDocument();
    expect(screen.getByText('五部位自由组装')).toBeInTheDocument();
    expect(screen.queryByText('玩几轮？')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(onStart).toHaveBeenCalledWith('monster-car', 1);
  });

  it('怪兽汽车超过四人时禁止开局并说明人数上限', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const crowdedRoom: RoomView = {
      ...room,
      players: [
        ...players,
        { id: 'p4', nickname: '第四位', avatar: '🐨', role: 'player', connected: true },
        { id: 'p5', nickname: '第五位', avatar: '🐯', role: 'player', connected: true },
      ],
    };
    render(<Lobby room={crowdedRoom} playerId="owner" onStart={onStart} onLeave={vi.fn()} pending={false} />);

    await user.click(screen.getByRole('radio', { name: /怪兽汽车/ }));
    const start = screen.getByRole('button', { name: '开始游戏' });
    expect(start).toBeDisabled();
    expect(screen.getByText('「怪兽汽车」最多 4 位玩家，请选择其他游戏')).toBeInTheDocument();
    await user.click(start);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('按在场人数排序：可玩的游戏排在前面，超员游戏沉底并标注上限', () => {
    const crowdedRoom: RoomView = {
      ...room,
      players: [
        ...players,
        { id: 'p4', nickname: '第四位', avatar: '🐨', role: 'player', connected: true },
        { id: 'p5', nickname: '第五位', avatar: '🐯', role: 'player', connected: true },
      ],
    };
    render(<Lobby room={crowdedRoom} playerId="owner" onStart={vi.fn()} onLeave={vi.fn()} pending={false} />);

    const order = screen.getAllByRole('radio').map((radio) => radio.textContent ?? '');
    // 5 人在场：谁最可能/存钱罐/德州扑克可玩，其余四款超员沉底。
    expect(order.map((text) => text.includes('谁最可能') ? 0 : text.includes('存钱罐') ? 1 : 2)).toEqual([0, 1, 2, 2, 2, 2, 2]);
    expect(order.find((text) => text.includes('怪兽汽车'))).toContain('限 4 人');
    expect(order.find((text) => text.includes('斗地主'))).toContain('限 3 人');
    expect(order[0]).not.toContain('限 4 人');
  });

  it('人还没到齐时，人数不足的游戏沉底并提示还差几位', () => {
    const twoPlayerRoom: RoomView = {
      ...room,
      players: [players[0]!, players[1]!],
    };
    render(<Lobby room={twoPlayerRoom} playerId="owner" onStart={vi.fn()} onLeave={vi.fn()} pending={false} />);

    const order = screen.getAllByRole('radio').map((radio) => radio.textContent ?? '');
    // 2 人在场：怪兽汽车/五子棋/飞行棋/德州扑克可玩，三个 3+ 游戏沉底。
    expect(order.map((text) => text.includes('怪兽汽车') ? 0 : text.includes('谁最可能') ? 1 : 2)).toEqual([0, 2, 2, 2, 1, 2, 2]);
    expect(screen.getAllByText('还差 1 人')).toHaveLength(3);
    expect(order[0]).not.toContain('还差 1 人');
  });

  it('详情区展示预计时长，并随轮数与游戏切换联动', async () => {
    const user = userEvent.setup();
    render(<Lobby room={room} playerId="owner" onStart={vi.fn()} onLeave={vi.fn()} pending={false} />);

    expect(screen.getByText('约 6 分钟')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '5 轮' }));
    expect(screen.getByText('约 10 分钟')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /怪兽汽车/ }));
    expect(screen.getByText('约 4 分钟')).toBeInTheDocument();
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
