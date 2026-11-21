import { useEffect, useState } from 'react';
import type { HoldemView } from '@party/games';
import { CARD_RANK_LABELS, CARD_SUITS, describeCard } from '@party/protocol';
import {
  betAnchor,
  communitySlot,
  dealerAnchor,
  ownCardsAnchor,
  pairCardAnchor,
  seatAnchor,
  seatCardsAnchor,
  seatOutward,
  tableLayout,
  TH_TABLE,
  type Anchor,
  type TableLayout,
} from './tableGeometry';

// ---------------------------------------------------------------------------
// 德州扑克 2D 俯视牌桌：椭圆毡布 + 环绕座位，纯受控 SVG，随视图快照整帧重绘。
// 信息层级：中央公共牌/彩池 → 座位头像/昵称/筹码 → 本街注/庄位/行动倒计时。
// 按屏幕方向选用横/竖布局预设（移动端优先：竖屏牌桌纵向撑满）。
// 无 WebGL 依赖，jsdom 可直接渲染断言；下注操作仍在 DOM 操作栏。
// ---------------------------------------------------------------------------

const ACCENT = '#ffd76e';
const INK = 'rgba(8, 14, 22, 0.85)';
const CREAM = '#f5efdd';
const TEXT_MAIN = '#f0e6cf';
const TEXT_DIM = '#a99f88';

export interface HoldemPlayerInfo {
  id: string;
  nickname: string;
  avatar: string;
}

interface TexasHoldemBoardProps {
  game: HoldemView;
  players: HoldemPlayerInfo[];
  playerId: string;
  /** 当前行动座位的剩余秒数（betting 阶段才有意义）。 */
  secondsLeft: number | null;
}

/** 昵称按字素截断到 6 字，避免座位标签过宽。 */
function clipName(name: string): string {
  const chars = [...name];
  return chars.length > 6 ? `${chars.slice(0, 6).join('')}…` : name;
}

function isRedSuit(suit: string): boolean {
  return suit === '♥' || suit === '♦';
}

/** 明牌：白底圆角卡，左上角点数、中央花色，红色花色染红。 */
function CardFace({ cardId, center, scale = 1 }: { cardId: number; center: Anchor; scale?: number }) {
  const w = TH_TABLE.cardW * scale;
  const h = TH_TABLE.cardH * scale;
  const suit = CARD_SUITS[Math.floor(cardId / 13)] ?? '?';
  const rank = CARD_RANK_LABELS[cardId % 13] ?? '?';
  const color = isRedSuit(suit) ? '#e0524a' : '#20242c';
  return (
    <g data-testid="th-card" data-card={describeCard(cardId)} transform={`translate(${center.x},${center.y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6 * scale} fill="#fbf7ea" stroke="#b9b2a0" strokeWidth={1} />
      <text x={-w / 2 + 6 * scale} y={-h / 2 + 17 * scale} fontSize={15 * scale} fontWeight={700} fill={color}>
        {rank}
      </text>
      <text x={0} y={8 * scale} textAnchor="middle" fontSize={26 * scale} fill={color}>
        {suit}
      </text>
    </g>
  );
}

/** 牌背：深蓝底 + 内嵌浅框，面向外发到其他座位。 */
function CardBack({ center, scale = 1 }: { center: Anchor; scale?: number }) {
  const w = TH_TABLE.cardW * scale;
  const h = TH_TABLE.cardH * scale;
  return (
    <g data-testid="th-card-back" transform={`translate(${center.x},${center.y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6 * scale} fill="#233c55" stroke="#0f1f2e" strokeWidth={1} />
      <rect x={-w / 2 + 5 * scale} y={-h / 2 + 5 * scale} width={w - 10 * scale} height={h - 10 * scale} rx={4 * scale} fill="none" stroke="rgba(255,231,166,0.4)" strokeWidth={1.5} />
    </g>
  );
}

/** 本街注筹码徽章：迷你筹码圆片 + 金额文字。 */
function BetBadge({ center, amount }: { center: Anchor; amount: number }) {
  return (
    <g data-testid="th-bet" transform={`translate(${center.x},${center.y})`}>
      <circle r={11} fill={CREAM} stroke="#1c4a6e" strokeWidth={3} strokeDasharray="3.5 3" />
      <text x={17} y={5.5} fontSize={15} fontWeight={700} fill="#ffe9ad" stroke={INK} strokeWidth={3} paintOrder="stroke">
        {amount}
      </text>
    </g>
  );
}

/** 竖屏检测：移动端优先，竖屏换用纵向椭圆布局；jsdom 下 matchMedia 返回 false。 */
function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(() => window.matchMedia?.('(orientation: portrait)').matches ?? false);
  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)');
    const onChange = (event: MediaQueryListEvent) => setPortrait(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return portrait;
}

export function TexasHoldemBoard({ game, players, playerId, secondsLeft }: TexasHoldemBoardProps) {
  const portrait = usePortrait();
  const layout: TableLayout = tableLayout(portrait);
  const count = game.seats.length;
  const foundSelfSeat = game.seats.findIndex((seat) => seat.playerId === playerId);
  const selfSeat = foundSelfSeat >= 0 ? foundSelfSeat : 0;
  const ownCardIds = foundSelfSeat >= 0 ? game.ownCards : null;
  const winnerIds = game.phase === 'hand-end'
    ? (game.handResult?.potWinners.flatMap((pot) => pot.winnerIds) ?? [])
    : [];

  return (
    <svg
      className="th-board"
      viewBox={`${-layout.viewHalfX} ${-layout.viewHalfY} ${layout.viewHalfX * 2} ${layout.viewHalfY * 2}`}
      role="img"
      aria-label="德州扑克牌桌"
      data-phase={game.phase}
      data-street={game.street}
      data-orientation={portrait ? 'portrait' : 'landscape'}
    >
      <defs>
        <radialGradient id="th-felt" cx="50%" cy="42%" r="72%">
          <stop offset="0%" stopColor="#2a5f8a" />
          <stop offset="70%" stopColor="#1c4a6e" />
          <stop offset="100%" stopColor="#153a56" />
        </radialGradient>
      </defs>

      {/* 木质包边 + 毡布桌面 + 金色内嵌线 */}
      <ellipse rx={layout.rimRx} ry={layout.rimRy} fill="#2c2118" stroke="#4a3826" strokeWidth={6} />
      <ellipse rx={layout.feltRx} ry={layout.feltRy} fill="url(#th-felt)" stroke="#102a3d" strokeWidth={2} />
      <ellipse rx={layout.inlayRx} ry={layout.inlayRy} fill="none" stroke="rgba(216,181,106,0.4)" strokeWidth={1.6} />

      {/* 公共牌：5 个固定槽位，未发槽留虚线空框 */}
      <g data-testid="th-community">
        {[0, 1, 2, 3, 4].map((index) => {
          const slot = communitySlot(index, 5, layout);
          const cardId = game.community[index];
          return cardId === undefined
            ? (
                <rect
                  key={index}
                  data-testid="th-slot"
                  x={slot.x - TH_TABLE.cardW / 2}
                  y={slot.y - TH_TABLE.cardH / 2}
                  width={TH_TABLE.cardW}
                  height={TH_TABLE.cardH}
                  rx={6}
                  fill="rgba(10,20,30,0.25)"
                  stroke="rgba(233,226,211,0.25)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
              )
            : <CardFace key={index} cardId={cardId} center={slot} />;
        })}
      </g>

      {/* 彩池 */}
      {game.pot > 0 && (
        <g data-testid="th-pot" transform={`translate(0,${layout.potY})`}>
          <circle cx={-14} r={10} fill={CREAM} stroke="#1c4a6e" strokeWidth={3} strokeDasharray="3.5 3" />
          <text x={12} y={6} textAnchor="middle" fontSize={19} fontWeight={800} fill="#ffe9ad" stroke={INK} strokeWidth={4} paintOrder="stroke">
            彩池 {game.pot}
          </text>
        </g>
      )}

      {/* 座位：头像向外，单行「昵称（我） · 筹码」不会被状态胶囊遮挡 */}
      {game.seats.map((seat, index) => {
        const player = players.find((entry) => entry.id === seat.playerId);
        const isSelf = seat.playerId === playerId;
        const isTurn = game.phase === 'betting' && game.toActSeat === index;
        const anchor = seatAnchor(layout, index, selfSeat, count);
        const outward = seatOutward(index, selfSeat, count);
        const cardsCenter = seatCardsAnchor(layout, index, selfSeat, count);
        const labelPoint = { x: anchor.x + outward.x * 38, y: anchor.y + outward.y * 38 };
        const revealed = game.revealed?.[seat.playerId];
        const status = seat.folded ? '已弃牌' : seat.allIn ? '全下' : null;
        const statusColor = seat.folded ? TEXT_DIM : ACCENT;
        const countdown = isTurn && secondsLeft !== null && secondsLeft > 0
          ? Math.min(1, secondsLeft / 60)
          : null;
        const ringR = TH_TABLE.avatarR + 8;
        const ringCircumference = 2 * Math.PI * ringR;
        return (
          <g
            key={seat.playerId}
            data-testid="th-seat"
            data-seat={index}
            data-player-id={seat.playerId}
            data-acting={isTurn || undefined}
            data-folded={seat.folded || undefined}
            data-winner={winnerIds.includes(seat.playerId) || undefined}
            opacity={seat.folded ? 0.45 : 1}
          >
            {isTurn && <circle cx={anchor.x} cy={anchor.y} r={ringR} fill="none" stroke={ACCENT} strokeWidth={3.5} />}
            {countdown !== null && (
              <circle
                data-testid="th-countdown"
                cx={anchor.x}
                cy={anchor.y}
                r={ringR}
                fill="none"
                stroke={ACCENT}
                strokeWidth={7}
                strokeDasharray={`${ringCircumference * countdown} ${ringCircumference * (1 - countdown)}`}
                transform={`rotate(-90 ${anchor.x} ${anchor.y})`}
                opacity={0.85}
              />
            )}
            {winnerIds.includes(seat.playerId) && (
              <circle cx={anchor.x} cy={anchor.y} r={ringR + 6} fill="none" stroke={ACCENT} strokeWidth={4} opacity={0.9} />
            )}
            <circle cx={anchor.x} cy={anchor.y} r={TH_TABLE.avatarR} fill="rgba(18,24,32,0.92)" stroke={isTurn ? ACCENT : 'rgba(140,150,168,0.7)'} strokeWidth={2} />
            <text x={anchor.x} y={anchor.y + 8} textAnchor="middle" fontSize={22}>
              {player?.avatar ?? '🦊'}
            </text>
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              fontSize={15}
              fontWeight={700}
              fill={isTurn ? ACCENT : seat.folded ? TEXT_DIM : TEXT_MAIN}
              stroke={INK}
              strokeWidth={3}
              paintOrder="stroke"
            >
              {`${clipName(player?.nickname ?? '?')}${isSelf ? '（我）' : ''} · ${seat.stack}`}
              {status && <tspan fill={statusColor}>{` · ${status}`}</tspan>}
            </text>

            {/* 底牌：自己大牌明牌，他人小牌（摊牌按 revealed 翻开），弃牌收回 */}
            {isSelf && ownCardIds && !seat.folded && (
              <g data-testid="th-own-cards">
                {ownCardIds.map((cardId, cardIndex) => (
                  <CardFace
                    key={cardId}
                    cardId={cardId}
                    center={pairCardAnchor(ownCardsAnchor(layout), cardIndex, TH_TABLE.ownCardScale)}
                    scale={TH_TABLE.ownCardScale}
                  />
                ))}
              </g>
            )}
            {!isSelf && !seat.folded && (game.phase === 'betting' || game.phase === 'runout' || game.phase === 'hand-end')
              ? [0, 1].map((cardIndex) => {
                  const cardId = revealed?.[cardIndex];
                  return cardId === undefined
                    ? <CardBack key={cardIndex} center={pairCardAnchor(cardsCenter, cardIndex)} />
                    : <CardFace key={cardId} cardId={cardId} center={pairCardAnchor(cardsCenter, cardIndex)} />;
                })
              : null}

            {seat.streetBet > 0 && <BetBadge center={betAnchor(layout, index, selfSeat, count)} amount={seat.streetBet} />}
          </g>
        );
      })}

      {/* 庄家按钮 */}
      {count > 0 && game.buttonSeat >= 0 && game.buttonSeat < count && (() => {
        const dealer = dealerAnchor(layout, game.buttonSeat, selfSeat, count);
        return (
          <g data-testid="th-dealer" transform={`translate(${dealer.x},${dealer.y})`}>
            <circle r={15} fill={CREAM} stroke="#b9b2a0" strokeWidth={1.5} />
            <text y={5} textAnchor="middle" fontSize={14} fontWeight={800} fill="#20242c">D</text>
          </g>
        );
      })()}
    </svg>
  );
}
