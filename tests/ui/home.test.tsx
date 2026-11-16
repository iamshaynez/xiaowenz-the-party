import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@party/protocol';
import { App } from '../../apps/web/src/App';
import type { PartyConnection, PartyServices } from '../../apps/web/src/services/types';

const room = {
  code: 'ABC234',
  phase: 'lobby' as const,
  ownerId: 'owner',
  version: 1,
  players: [{ id: 'owner', nickname: '小文', avatar: '🦊', role: 'player' as const, connected: true }],
  game: null,
};

const session: Session = {
  sessionId: 'session-owner-001',
  playerId: 'owner',
  roomCode: 'ABC234',
  resumeToken: 'r'.repeat(32),
  room,
};

function fakeServices() {
  const connection: PartyConnection = { send: vi.fn(), close: vi.fn() };
  const services: PartyServices = {
    createRoom: vi.fn().mockResolvedValue(session),
    joinRoom: vi.fn().mockResolvedValue(session),
    connect: vi.fn((_session, handlers) => {
      queueMicrotask(() => {
        handlers.onMessage({ type: 'ready', session });
        handlers.onMessage({ type: 'room', room });
      });
      return connection;
    }),
  };
  return { services, connection };
}

describe('玩家进入派对', () => {
  it('首页游戏货架展示全部游戏与标签，选中后创建的房间会预选该游戏', async () => {
    const user = userEvent.setup();
    const { services } = fakeServices();
    render(<MemoryRouter><App services={services} /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: '今晚的游戏货架' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /谁最可能/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('破冰')).toBeInTheDocument();
    expect(screen.getByText('儿童')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /存钱罐/ }));
    expect(screen.getByText('开局游戏')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '创建派对' }));
    await user.type(screen.getByLabelText('你的昵称'), '小文');
    await user.click(screen.getByRole('button', { name: '创建并进入房间' }));

    expect(await screen.findByRole('heading', { name: '人都到齐了吗？' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /存钱罐/ })).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem('party.selectedGame')).toBe('piggy-bank');
    expect(window.localStorage.getItem('party.game.ABC234')).toBe('piggy-bank');
  });

  it('首页可以创建房间，选择昵称头像后直接进入专属大厅', async () => {
    const user = userEvent.setup();
    const { services } = fakeServices();
    render(<MemoryRouter><App services={services} /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: /把朋友凑在一起/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '创建派对' }));
    await user.type(screen.getByLabelText('你的昵称'), '小文');
    await user.click(screen.getByRole('button', { name: '创建并进入房间' }));

    expect(services.createRoom).toHaveBeenCalledWith({ nickname: '小文', avatar: '🦊' });
    expect(await screen.findByRole('heading', { name: '人都到齐了吗？' })).toBeInTheDocument();
    expect(screen.getByText('ABC234')).toBeInTheDocument();
    expect(await screen.findByAltText('房间二维码')).toBeInTheDocument();
  });

  it('输入房间码后加入，无需注册账号', async () => {
    const user = userEvent.setup();
    const { services } = fakeServices();
    render(<MemoryRouter initialEntries={['/r/ABC234']}><App services={services} /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: '加入这场派对' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('你的昵称'), '新朋友');
    await user.click(screen.getByRole('button', { name: '加入房间' }));

    expect(services.joinRoom).toHaveBeenCalledWith('ABC234', { nickname: '新朋友', avatar: '🦊' });
    expect(await screen.findByRole('heading', { name: '人都到齐了吗？' })).toBeInTheDocument();
    expect(screen.getByText('小文')).toBeInTheDocument();
  });

  it('首页房间码自动转大写，并能进入对应房间', async () => {
    const user = userEvent.setup();
    const { services } = fakeServices();
    render(<MemoryRouter><App services={services} /></MemoryRouter>);

    const input = screen.getByLabelText('六位房间码');
    await user.type(input, 'abc234');
    expect(input).toHaveValue('ABC234');
    await user.click(screen.getByRole('button', { name: '加入派对' }));
    expect(await screen.findByRole('heading', { name: '加入这场派对' })).toBeInTheDocument();
  });
});
