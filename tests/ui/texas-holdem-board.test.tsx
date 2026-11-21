import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { HoldemView } from '@party/games';
import {
  betAnchor,
  communitySlot,
  dealerAnchor,
  ownCardsAnchor,
  pairCardAnchor,
  seatAnchor,
  seatCardsAnchor,
  tableLayout,
  TH_TABLE,
} from '../../apps/web/src/components/texas-holdem/tableGeometry';
import { TexasHoldemBoard } from '../../apps/web/src/components/texas-holdem/TexasHoldemBoard';

// ---------------------------------------------------------------------------
// 德州扑克 2D 俯视牌桌：几何纯函数契约（自己恒在正下方、座位互不重叠、
// 下注/庄位/大牌锚点互不冲突、横竖两套布局）与 SVG 牌桌组件行为（公共牌、
// 彩池、行动高亮、摊牌亮牌、旁观者视野）。无 WebGL，jsdom 直接渲染。
// ---------------------------------------------------------------------------

const players = [
  { id: 'owner', nickname: '小文', avatar: '🦊' },
  { id: 'p2', nickname: '阿棕', avatar: '🐼' },
  { id: 'p3', nickname: '青蛙', avatar: '🐸' },
];

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const LAYOUTS = [tableLayout(false), tableLayout(true)] as const;

function viewWith(overrides: Partial<HoldemView> = {}): HoldemView {
  return {
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
    rankings: [],
    winners: [],
    ...overrides,
  };
}

describe('德州扑克 · 2D 牌桌几何', () => {
  it('自己（selfSeat）永远在桌面正下方，横竖布局与 2/3/6 人局都成立', () => {
    for (const layout of LAYOUTS) {
      for (const count of [2, 3, 6]) {
        const anchor = seatAnchor(layout, count - 1, count - 1, count);
        expect(anchor.x).toBeCloseTo(0, 6);
        expect(anchor.y).toBeCloseTo(layout.seatRy, 6);
      }
    }
    // 竖屏布局 = 同一桌面旋转 90°：viewBox 与椭圆半径互换。
    const landscape = tableLayout(false);
    const portrait = tableLayout(true);
    expect(portrait.viewHalfX).toBe(landscape.viewHalfY);
    expect(portrait.viewHalfY).toBe(landscape.viewHalfX);
    expect(portrait.feltRx).toBeLessThan(portrait.feltRy);
    for (const layout of LAYOUTS) {
      // 金色内嵌线在两套布局下都收在毡布内。
      expect(layout.inlayRx).toBeLessThan(layout.feltRx);
      expect(layout.inlayRy).toBeLessThan(layout.feltRy);
    }
  });

  it('座位锚点互不重叠，2 到 6 人局均保持可读间距', () => {
    for (const layout of LAYOUTS) {
      for (const count of [2, 3, 4, 5, 6]) {
        const anchors = Array.from({ length: count }, (_, seat) => seatAnchor(layout, seat, 0, count));
        for (let i = 0; i < anchors.length; i += 1) {
          for (let j = i + 1; j < anchors.length; j += 1) {
            expect(dist(anchors[i]!, anchors[j]!)).toBeGreaterThan(TH_TABLE.avatarR * 3);
          }
        }
      }
    }
  });

  it('下注锚点压到毡布内侧的下注椭圆，方向与座位一致', () => {
    for (const layout of LAYOUTS) {
      for (const count of [2, 3, 6]) {
        for (let seat = 0; seat < count; seat += 1) {
          const seatPoint = seatAnchor(layout, seat, 0, count);
          const bet = betAnchor(layout, seat, 0, count);
          // 精确落在下注椭圆上，且与座位同一方位角。
          expect(bet.x ** 2 / layout.betRx ** 2 + bet.y ** 2 / layout.betRy ** 2).toBeCloseTo(1, 6);
          expect(Math.abs(bet.x) / layout.betRx).toBeCloseTo(Math.abs(seatPoint.x) / layout.seatRx, 6);
          expect(bet.y).toBeLessThan(layout.feltRy);
          expect(bet.x * seatPoint.x).toBeGreaterThanOrEqual(0);
          expect(bet.y * seatPoint.y).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('庄位按钮沿切向让开本街注；大牌固定在毡布下缘且不与本街注/公共牌相撞', () => {
    for (const layout of LAYOUTS) {
      for (const count of [2, 3, 6]) {
        for (let seat = 0; seat < count; seat += 1) {
          expect(dist(dealerAnchor(layout, seat, 0, count), betAnchor(layout, seat, 0, count))).toBeGreaterThanOrEqual(TH_TABLE.dealerPerpOffset - 1e-6);
        }
      }
      const cardsTop = ownCardsAnchor(layout).y - (TH_TABLE.cardH * TH_TABLE.ownCardScale) / 2;
      const cardsBottom = ownCardsAnchor(layout).y + (TH_TABLE.cardH * TH_TABLE.ownCardScale) / 2;
      const cardHalfSpan = ((TH_TABLE.cardW + TH_TABLE.cardGap) * TH_TABLE.ownCardScale) / 2 + (TH_TABLE.cardW * TH_TABLE.ownCardScale) / 2;
      const betTop = betAnchor(layout, 0, 0, 1).y - 11; // 迷你筹码半径
      expect(cardsBottom).toBeLessThan(betTop);
      expect(cardsTop).toBeGreaterThan(layout.communityY + TH_TABLE.cardH / 2);
      expect(cardHalfSpan).toBeLessThan(Math.min(layout.feltRx, layout.feltRy));
    }
  });

  it('公共牌 5 槽围绕桌心对称居中且整排落在毡布内，座位小牌也在毡布内', () => {
    for (const layout of LAYOUTS) {
      expect(communitySlot(2, 5, layout).x).toBeCloseTo(0, 6);
      expect(communitySlot(0, 5, layout).x).toBeCloseTo(-communitySlot(4, 5, layout).x, 6);
      const rowEdge = communitySlot(4, 5, layout).x + TH_TABLE.cardW / 2;
      expect(rowEdge).toBeLessThan(layout.feltRx);
      for (let index = 0; index < 5; index += 1) {
        expect(communitySlot(index, 5, layout).y).toBe(layout.communityY);
        expect(Math.abs(communitySlot(index, 5, layout).x)).toBeLessThanOrEqual(rowEdge);
      }
      for (const count of [2, 3, 6]) {
        for (let seat = 0; seat < count; seat += 1) {
          const cards = seatCardsAnchor(layout, seat, 0, count);
          // 小牌允许压在毡布边缘（横竖屏两人局均如此），但不得越过木质包边。
          expect(Math.hypot(cards.x / layout.rimRx, cards.y / layout.rimRy)).toBeLessThan(1);
        }
      }
    }
  });

  it('两张并排牌围绕中心对称', () => {
    const center = { x: 10, y: -20 };
    const first = pairCardAnchor(center, 0);
    const second = pairCardAnchor(center, 1);
    expect(first.x).toBeCloseTo(center.x - (TH_TABLE.cardW + TH_TABLE.cardGap) / 2, 6);
    expect(second.x).toBeCloseTo(center.x + (TH_TABLE.cardW + TH_TABLE.cardGap) / 2, 6);
    expect(first.y).toBe(center.y);
  });
});

describe('德州扑克 · 2D 牌桌渲染', () => {
  it('翻牌前：两人座位、庄位按钮、自己的口袋对与倒计时弧可见', () => {
    render(<TexasHoldemBoard game={viewWith()} players={players} playerId="owner" secondsLeft={58} />);
    const board = screen.getByRole('img', { name: '德州扑克牌桌' });
    expect(board).toBeVisible();

    const seats = within(board).getAllByTestId('th-seat');
    expect(seats).toHaveLength(2);
    expect(seats[0]).toHaveAttribute('data-acting');
    expect(within(board).getByTestId('th-countdown')).toBeVisible();
    expect(within(board).getByTestId('th-dealer')).toBeVisible();

    const ownCards = within(board).getByTestId('th-own-cards');
    expect(within(ownCards).getAllByTestId('th-card').map((card) => card.getAttribute('data-card'))).toEqual(['♠A', '♥A']);
    expect(within(board).getAllByTestId('th-card-back')).toHaveLength(2);

    expect(within(board).getAllByTestId('th-slot')).toHaveLength(5);
    expect(within(board).getByTestId('th-pot')).toHaveTextContent('彩池 30');
    // 筹码与昵称同行展示，顶部座位也不会被状态胶囊遮挡。
    expect(seats[1]!.textContent).toContain('阿棕 · 1980');
    expect(within(seats[1]!).getByText('20')).toBeVisible();
  });

  it('翻牌：公共牌明牌按花色点数渲染，空槽补位', () => {
    render(<TexasHoldemBoard game={viewWith({ street: 'flop', community: [3, 16, 29] })} players={players} playerId="owner" secondsLeft={40} />);
    const community = within(screen.getByRole('img', { name: '德州扑克牌桌' })).getByTestId('th-community');
    const cards = within(community).getAllByTestId('th-card').map((card) => card.getAttribute('data-card'));
    expect(cards).toEqual(['♠5', '♥5', '♣5']);
    expect(within(community).getAllByTestId('th-slot')).toHaveLength(2);
  });

  it('弃牌座位变暗、收回底牌并标注状态；全下保留徽标', () => {
    const view = viewWith({
      seats: [
        { playerId: 'owner', stack: 1990, streetBet: 10, committed: 10, folded: false, allIn: false },
        { playerId: 'p2', stack: 1980, streetBet: 20, committed: 20, folded: true, allIn: false },
        { playerId: 'p3', stack: 2_000, streetBet: 0, committed: 0, folded: false, allIn: true },
      ],
      toActSeat: 2,
    });
    render(<TexasHoldemBoard game={view} players={players} playerId="owner" secondsLeft={30} />);
    const board = screen.getByRole('img', { name: '德州扑克牌桌' });
    const seats = within(board).getAllByTestId('th-seat');
    const folded = seats.find((seat) => seat.getAttribute('data-folded'));
    expect(folded).toBeDefined();
    expect(within(folded!).queryByTestId('th-card-back')).toBeNull();
    expect(folded!.textContent).toContain('已弃牌');
    const allIn = seats.find((seat) => seat.getAttribute('data-player-id') === 'p3');
    expect(allIn!.textContent).toContain('全下');
  });

  it('摊牌结算：revealed 底牌翻明，赢家座位高亮', () => {
    const view = viewWith({
      phase: 'hand-end',
      toActSeat: null,
      deadlineAt: null,
      revealed: { owner: [12, 25], p2: [1, 14] },
      handResult: {
        potWinners: [{ amount: 30, winnerIds: ['owner'], share: 30 }],
        uncalledRefund: null,
        eliminations: [],
        showdown: true,
      },
    });
    render(<TexasHoldemBoard game={view} players={players} playerId="owner" secondsLeft={null} />);
    const board = screen.getByRole('img', { name: '德州扑克牌桌' });
    expect(within(board).queryByTestId('th-countdown')).toBeNull();
    const winner = within(board).getAllByTestId('th-seat').find((seat) => seat.getAttribute('data-winner'));
    expect(winner).toHaveAttribute('data-player-id', 'owner');
    const revealedCards = within(board).getAllByTestId('th-card').map((card) => card.getAttribute('data-card'));
    expect(revealedCards).toContain('♠3');
    expect(revealedCards).toContain('♥3');
  });

  it('旁观者：无自己的大牌，座位环以 0 号为基准仍完整可见', () => {
    render(<TexasHoldemBoard game={viewWith()} players={players} playerId="spectator" secondsLeft={12} />);
    const board = screen.getByRole('img', { name: '德州扑克牌桌' });
    expect(within(board).queryByTestId('th-own-cards')).toBeNull();
    expect(within(board).getAllByTestId('th-seat')).toHaveLength(2);
    expect(within(board).getByTestId('th-countdown')).toBeVisible();
  });
});
