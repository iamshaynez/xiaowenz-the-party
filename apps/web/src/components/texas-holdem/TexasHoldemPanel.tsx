import { useEffect, useMemo, useState } from 'react';
import { Crown, Diamond, RotateCcw, Spade } from 'lucide-react';
import type { HoldemView } from '@party/games';
import { HOLDEM_STARTING_STACK, describeHoldemCards } from '@party/games';
import { playerAvatarOf, playerNameOf } from '../playerDisplay';
import type { GamePanelProps } from '../gamePanelTypes';
import { TexasHoldemBoard } from './TexasHoldemBoard';
import type { HoldemPlayerInfo } from './TexasHoldemBoard';

const STREET_LABELS = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌' } as const;

// 德州扑克面板：2D 俯视 SVG 牌桌（无 WebGL 依赖）+ DOM 操作栏（弃牌/过牌/跟注/下注/加注）。
export function TexasHoldemPanel({ room, playerId, onAction, onEndGame, pending, serverClockOffsetMs = 0 }: GamePanelProps) {
  const game = room.game as HoldemView;
  const isOwner = room.ownerId === playerId;
  const players: HoldemPlayerInfo[] = room.players.map((player) => ({ id: player.id, nickname: player.nickname, avatar: player.avatar }));
  const mySeatView = game.seats.find((seat) => seat.playerId === playerId);
  const isMyTurn = game.phase === 'betting' && game.seats[game.toActSeat ?? -1]?.playerId === playerId;
  const [now, setNow] = useState(Date.now() + serverClockOffsetMs);
  const [raiseAmount, setRaiseAmount] = useState<number | null>(null);

  useEffect(() => {
    if (game.phase === 'finished') return;
    const timer = window.setInterval(() => setNow(Date.now() + serverClockOffsetMs), 250);
    return () => window.clearInterval(timer);
  }, [game.phase, serverClockOffsetMs]);

  const toCall = mySeatView ? Math.max(0, game.currentBet - mySeatView.streetBet) : 0;
  const canCheck = toCall === 0;
  const callCost = Math.min(toCall, mySeatView?.stack ?? 0);
  const allInTotal = (mySeatView?.stack ?? 0) + (mySeatView?.streetBet ?? 0);
  const openBet = game.currentBet === 0;
  const minAmount = openBet ? Math.min(game.blinds.bb, allInTotal) : Math.min(game.minRaiseTo, allInTotal);
  const maxAmount = allInTotal;

  // 每次轮到自己重置滑杆到最小值。
  useEffect(() => {
    if (isMyTurn) setRaiseAmount(null);
  }, [isMyTurn, game.handNumber, game.street]);

  const amount = raiseAmount ?? minAmount;
  const isAllIn = amount >= maxAmount;
  const isFullRaise = amount >= game.minRaiseTo;
  const streetLabel = STREET_LABELS[game.street];

  const myHandLabel = useMemo(() => {
    if (!game.ownCards || game.community.length === 0) return null;
    return describeHoldemCards([...game.ownCards, ...game.community]);
  }, [game.ownCards, game.community]);

  const secondsLeft = game.deadlineAt !== null ? Math.max(0, Math.ceil((game.deadlineAt - now) / 1_000)) : null;
  const turnPlayer = game.toActSeat !== null ? game.seats[game.toActSeat] : null;

  const submitRaise = () => {
    if (!isMyTurn || pending) return;
    if (openBet) onAction({ type: 'bet', amount });
    else onAction({ type: 'raise-to', amount });
  };

  const quickAmount = (factor: number) => setRaiseAmount(Math.max(minAmount, Math.min(maxAmount, Math.round(
    openBet ? game.blinds.bb * factor : game.currentBet + (game.pot + toCall) * factor,
  ))));

  return (
    <main className="bt-shell bt-texas-holdem">
      <header className="bt-topbar">
        <span className="bt-game-title"><Spade size={18} />德州扑克 · 第 {game.handNumber} / {game.totalHands} 手</span>
        <div className="th-meta" aria-label="牌局信息">
          <span>盲注 {game.blinds.sb}/{game.blinds.bb}</span>
          <span>彩池 {game.pot}</span>
          <span>我 {game.ownStack} 筹码</span>
        </div>
      </header>

      <section className="bt-stage" aria-label="德州扑克牌桌">
        <TexasHoldemBoard game={game} players={players} playerId={playerId} secondsLeft={secondsLeft} />

        {(game.phase === 'betting' || game.phase === 'runout') && (
          <div className={`bt-status ${isMyTurn ? 'is-my-turn' : ''}`} role="status">
            {isMyTurn
              ? <>{streetLabel} · 轮到你行动 · {secondsLeft ?? '—'} 秒{myHandLabel ? ` · 当前牌力：${myHandLabel}` : ''}</>
              : <>{streetLabel} · 等待 {turnPlayer ? playerNameOf(room.players, turnPlayer.playerId) : '…'}{game.phase === 'runout' ? ' · 全下发牌中…' : ''}</>}
          </div>
        )}

        {isMyTurn && (
          <div className="bt-action-dock th-actions" role="group" aria-label="下注操作">
            <button className="th-fold-button" type="button" disabled={pending} onClick={() => onAction({ type: 'fold' })}>弃牌</button>
            {canCheck
              ? <button className="bt-ghost-button" type="button" disabled={pending} onClick={() => onAction({ type: 'check' })}>过牌</button>
              : <button className="bt-ghost-button" type="button" disabled={pending} onClick={() => onAction({ type: 'call' })}>跟注 {callCost}</button>}
            <div className="th-raise-group">
              <input
                className="th-raise-slider"
                type="range"
                min={minAmount}
                max={maxAmount}
                step={10}
                value={Math.min(Math.max(amount, minAmount), maxAmount)}
                aria-label={openBet ? '下注额度' : '加注到的额度'}
                onChange={(event) => setRaiseAmount(Number(event.target.value))}
                disabled={pending || minAmount >= maxAmount}
              />
              <div className="th-quick-amounts" aria-hidden={false}>
                <button type="button" disabled={pending || minAmount >= maxAmount} onClick={() => quickAmount(1)}>底池</button>
                <button type="button" disabled={pending || minAmount >= maxAmount} onClick={() => setRaiseAmount(maxAmount)}>全下</button>
              </div>
              <button
                className="bt-primary-button"
                type="button"
                disabled={pending || minAmount >= maxAmount || (!isFullRaise && amount < maxAmount)}
                onClick={submitRaise}
              >
                {openBet ? '下注' : '加注到'} {amount}{isAllIn ? '（全下）' : ''}
              </button>
            </div>
          </div>
        )}

        {game.phase === 'hand-end' && game.handResult && (
          <section className="bt-overlay" aria-label="本手结算">
            <h2><Diamond size={20} />{game.handResult.showdown ? '摊牌' : '无人跟注'}</h2>
            <ul className="th-pots">
              {game.handResult.potWinners.map((pot, index) => (
                <li key={index}>
                  {index === 0 ? '主池' : `边池 ${index}`} {pot.amount} → {pot.winnerIds.map((id) => playerNameOf(room.players, id)).join('、')}
                  {pot.winnerIds.length > 1 ? `（平分，各 ${pot.share}）` : ''}
                </li>
              ))}
              {game.handResult.uncalledRefund && (
                <li className="th-refund">未跟注 {game.handResult.uncalledRefund.amount} 退回 {playerNameOf(room.players, game.handResult.uncalledRefund.playerId)}</li>
              )}
              {game.revealed && Object.keys(game.revealed).length > 0 && (
                <li className="th-revealed">
                  亮牌：{Object.entries(game.revealed).map(([id, cards]) => `${playerNameOf(room.players, id)}（${describeHoldemCards([...cards, ...game.community])}）`).join('，')}
                </li>
              )}
              {game.handResult.eliminations.length > 0 && (
                <li className="th-eliminated">出局：{game.handResult.eliminations.map((id) => playerNameOf(room.players, id)).join('、')}</li>
              )}
            </ul>
            <div className="bt-overlay-actions">
              {isOwner && game.handNumber < game.totalHands && (
                <button className="bt-primary-button" type="button" disabled={pending} onClick={() => onAction({ type: 'next-hand' })}>下一手</button>
              )}
              {!isOwner && game.handNumber < game.totalHands && <p className="bt-waiting">即将自动开始下一手</p>}
            </div>
          </section>
        )}

        {game.phase === 'finished' && (
          <section className="bt-overlay" aria-label="比赛结束">
            <h2><Crown size={22} />{game.winners.length > 0 ? `${game.winners.map((id) => playerNameOf(room.players, id)).join('、')} 拿下冠军` : '比赛结束'}</h2>
            <ol className="th-ranking">
              {game.rankings.map((entry) => (
                <li key={entry.playerId} className={entry.playerId === playerId ? 'is-own' : ''}>
                  第 {entry.place} 名 · {playerAvatarOf(room.players, entry.playerId)} {playerNameOf(room.players, entry.playerId)} · {entry.stack} 筹码
                </li>
              ))}
            </ol>
            <p className="th-stack-hint">起始筹码 {HOLDEM_STARTING_STACK}</p>
            <div className="bt-overlay-actions">
              {isOwner && <button className="bt-primary-button" type="button" disabled={pending} onClick={() => onAction({ type: 'play-again' })}><RotateCcw size={16} />再来一局</button>}
              {isOwner && <button className="bt-ghost-button" type="button" disabled={pending} onClick={onEndGame}>换个游戏</button>}
              {!isOwner && <p className="bt-waiting">等房主决定下一局</p>}
            </div>
          </section>
        )}
      </section>
      <div className="sr-only" role="status">
        {game.phase === 'betting' ? `${streetLabel}，轮到 ${turnPlayer ? playerNameOf(room.players, turnPlayer.playerId) : ''} 行动` : '德州扑克进行中'}
      </div>
    </main>
  );
}
