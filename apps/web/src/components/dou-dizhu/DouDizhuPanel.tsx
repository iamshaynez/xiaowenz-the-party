import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Hand, RotateCcw, Sparkles } from 'lucide-react';
import { describeCard } from '@party/protocol';
import type { DouDizhuView } from '@party/games';
import { douDizhuBeats, parseDouDizhuCombo } from '@party/games';
import { playerNameOf } from '../playerDisplay';
import type { GamePanelProps } from '../gamePanelTypes';
import { DouDizhuCanvas } from './DouDizhuCanvas';
import type { DouDizhuPlayerInfo } from './DouDizhuScene';

// 斗地主面板：3D 牌桌 + 底部操作条（叫分 / 出牌 / 不要）。
export function DouDizhuPanel({ room, playerId, onAction, onEndGame, pending, serverClockOffsetMs = 0 }: GamePanelProps) {
  const game = room.game as DouDizhuView;
  const isOwner = room.ownerId === playerId;
  const players: DouDizhuPlayerInfo[] = room.players.map((player) => ({ id: player.id, nickname: player.nickname, avatar: player.avatar }));
  // 座位以开局时的座位表为准：中途有人退出房间后 players 顺序会前移，不能用其索引。
  const mySeat = game.seats.indexOf(playerId);
  const seatPlayerName = (seat: number | null) => {
    const seatId = seat !== null ? game.seats[seat] : undefined;
    return seatId !== undefined ? playerNameOf(room.players, seatId) : '';
  };
  const isMyTurn = game.turnSeat !== null && game.turnSeat === mySeat && (game.phase === 'bidding' || game.phase === 'playing');
  const isLandlord = game.landlordId === playerId;
  const [webglFailed, setWebglFailed] = useState(false);
  const handleRenderFailure = useCallback(() => setWebglFailed(true), []);
  const [selected, setSelected] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now() + serverClockOffsetMs);

  useEffect(() => {
    if (game.phase === 'finished') return;
    const timer = window.setInterval(() => setNow(Date.now() + serverClockOffsetMs), 250);
    return () => window.clearInterval(timer);
  }, [game.phase, serverClockOffsetMs]);

  // 手牌变化后剔除已不在手里的选中牌。
  useEffect(() => {
    setSelected((current) => current.filter((cardId) => game.ownHand.includes(cardId)));
  }, [game.ownHand]);

  const selectedCombo = useMemo(() => parseDouDizhuCombo([...selected].sort((a, b) => a - b)), [selected]);
  const canBeat = selectedCombo && game.lastPlay ? douDizhuBeats(selectedCombo, game.lastPlay.combo) : true;
  const isLeading = game.phase === 'playing' && !game.lastPlay;
  const playValid = game.phase === 'playing' && isMyTurn && selectedCombo !== null && (isLeading || canBeat);
  const canPass = game.phase === 'playing' && isMyTurn && !isLeading;
  const secondsLeft = game.deadlineAt !== null ? Math.max(0, Math.ceil((game.deadlineAt - now) / 1_000)) : null;
  const currentHighBid = game.bids.reduce((high, entry) => Math.max(high, entry.points), 0);

  const toggleCard = (cardId: number) => {
    if (!isMyTurn || game.phase !== 'playing' || pending) return;
    setSelected((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]);
  };

  const bid = (points: 1 | 2 | 3) => {
    if (!isMyTurn || game.phase !== 'bidding' || pending) return;
    onAction({ type: 'bid', points });
  };

  const playSelected = () => {
    if (!playValid || pending) return;
    onAction({ type: 'play-cards', cards: selected });
    setSelected([]);
  };

  return (
    <main className="bt-shell bt-dou-dizhu">
      <header className="bt-topbar">
        <span className="bt-game-title"><Hand size={18} />斗地主 · 第 {game.hand} / {game.totalHands} 手</span>
        <div className="dd-scores" aria-label="积分">
          {players.map((player) => (
            <span key={player.id} className={`${game.landlordId === player.id ? 'is-landlord' : ''} ${player.id === playerId ? 'is-own' : ''}`}>
              {game.landlordId === player.id ? '👑' : ''}{player.nickname} {game.scores[player.id] ?? 0}
            </span>
          ))}
        </div>
      </header>

      <section className="bt-stage" aria-label="斗地主牌桌">
        {!webglFailed ? (
          <DouDizhuCanvas
            game={game}
            players={players}
            playerId={playerId}
            selected={selected}
            canSelect={isMyTurn && game.phase === 'playing' && !pending}
            onToggleCard={toggleCard}
            onPlaySelected={playSelected}
            onFailure={handleRenderFailure}
          />
        ) : (
          <div className="dd-dom-table" role="group" aria-label="斗地主牌桌（文字模式）">
            {game.ownHand.map((cardId) => (
              <button
                key={cardId}
                type="button"
                className={`dd-dom-card ${selected.includes(cardId) ? 'is-selected' : ''}`}
                disabled={!isMyTurn || game.phase !== 'playing' || pending}
                onClick={() => toggleCard(cardId)}
              >{describeCard(cardId)}</button>
            ))}
          </div>
        )}

        {(game.phase === 'bidding' || game.phase === 'playing') && (
          <div className={`bt-status ${isMyTurn ? 'is-my-turn' : ''}`} role="status">
            {game.phase === 'bidding'
              ? (isMyTurn
                ? <>轮到你叫分（当前最高 {currentHighBid} 分）· {secondsLeft ?? '—'} 秒</>
                : <>等待 {seatPlayerName(game.turnSeat)} 叫分</>)
              : (isMyTurn
                ? <>轮到你出牌{isLeading ? '（你来领出）' : ''} · {secondsLeft ?? '—'} 秒</>
                : <>等待 {seatPlayerName(game.turnSeat)} 出牌</>)}
          </div>
        )}

        {game.phase === 'bidding' && isMyTurn && (
          <div className="bt-action-dock" role="group" aria-label="叫分">
            <button className="bt-ghost-button" type="button" disabled={pending} onClick={() => onAction({ type: 'pass' })}>不叫</button>
            {[1, 2, 3].map((points) => (
              <button
                key={points}
                className="bt-primary-button"
                type="button"
                disabled={pending || points <= currentHighBid}
                onClick={() => bid(points as 1 | 2 | 3)}
              >{points} 分</button>
            ))}
          </div>
        )}

        {game.phase === 'playing' && isMyTurn && (
          <div className="bt-action-dock" role="group" aria-label="出牌操作">
            {canPass && (
              <button className="bt-ghost-button" type="button" disabled={pending} onClick={() => { setSelected([]); onAction({ type: 'pass' }); }}>不要</button>
            )}
            <button
              className="bt-primary-button"
              type="button"
              disabled={!playValid || pending}
              onClick={() => {
                onAction({ type: 'play-cards', cards: selected });
                setSelected([]);
              }}
            >
              出牌{selectedCombo ? ` · ${selectedCombo.type}` : ''}
            </button>
            <button className="bt-ghost-button" type="button" disabled={pending || selected.length === 0} onClick={() => setSelected([])}>清除选择</button>
          </div>
        )}

        {game.phase === 'hand-result' && game.handResult && (
          <section className="bt-overlay" aria-label="本手结算">
            <h2><Sparkles size={20} />{playerNameOf(room.players, game.handResult.winnerId)} 率先出完</h2>
            <p>
              {game.handResult.landlordWins ? '地主赢' : '农民赢'} · 叫分 {game.handResult.bid} · 炸弹 ×{game.handResult.bombs}
              {game.handResult.spring === 'spring' ? ' · 春天 ×2' : game.handResult.spring === 'anti-spring' ? ' · 反春 ×2' : ''}
              · 总倍数 {game.handResult.multiplier}
            </p>
            <ul className="dd-deltas">
              {players.map((player) => (
                <li key={player.id} className={player.id === playerId ? 'is-own' : ''}>
                  {game.handResult!.landlordId === player.id ? '👑 ' : ''}{player.nickname}：
                  <strong>{(game.handResult!.deltas[player.id] ?? 0) > 0 ? '+' : ''}{game.handResult!.deltas[player.id] ?? 0}</strong>
                </li>
              ))}
            </ul>
            <div className="bt-overlay-actions">
              {isOwner && game.hand < game.totalHands && (
                <button className="bt-primary-button" type="button" disabled={pending} onClick={() => onAction({ type: 'next-hand' })}>下一手</button>
              )}
              {!isOwner && game.hand < game.totalHands && <p className="bt-waiting">等房主开下一手</p>}
            </div>
          </section>
        )}

        {game.phase === 'finished' && (
          <section className="bt-overlay" aria-label="对局结束">
            <h2><Crown size={22} />{game.winners.length > 0 ? `${game.winners.map((id) => playerNameOf(room.players, id)).join('、')} 赢下整场` : '平局'}</h2>
            <p>{isLandlord ? '你是地主' : '你是农民'} · 每手结算见积分</p>
            <div className="bt-overlay-actions">
              {isOwner && <button className="bt-primary-button" type="button" disabled={pending} onClick={() => onAction({ type: 'play-again' })}><RotateCcw size={16} />再来一局</button>}
              {isOwner && <button className="bt-ghost-button" type="button" disabled={pending} onClick={onEndGame}>换个游戏</button>}
              {!isOwner && <p className="bt-waiting">等房主决定下一局</p>}
            </div>
          </section>
        )}
      </section>
      <div className="sr-only" role="status">
        {game.phase === 'playing' ? `轮到 ${seatPlayerName(game.turnSeat)} 出牌` : '斗地主进行中'}
      </div>
    </main>
  );
}
