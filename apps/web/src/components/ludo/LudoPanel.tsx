import { useEffect, useMemo, useState } from 'react';
import { Crown, Dices, RotateCcw } from 'lucide-react';
import type { LudoView } from '@party/games';
import { playerNameOf } from '../playerDisplay';
import type { GamePanelProps } from '../gamePanelTypes';
import { LudoBoard } from './LudoBoard';
import type { LudoPlayerInfo } from './LudoBoard';
import { LUDO_SEAT_COLORS } from './LudoBoard';

// 飞行棋面板：2D SVG 棋盘 + DOM 骰子与操作条（无 WebGL 依赖）。
export function LudoPanel({ room, playerId, onAction, onEndGame, pending, serverClockOffsetMs = 0 }: GamePanelProps) {
  const game = room.game as LudoView;
  const isOwner = room.ownerId === playerId;
  const players: LudoPlayerInfo[] = room.players.map((player) => ({ id: player.id, nickname: player.nickname, avatar: player.avatar }));
  // 座位以开局时的座位表为准：中途有人退出房间后 players 顺序会前移，不能用其索引。
  const mySeat = game.seats.indexOf(playerId);
  const isMyTurn = game.seat !== null && game.seat === mySeat && game.phase === 'playing';
  const [now, setNow] = useState(Date.now() + serverClockOffsetMs);

  useEffect(() => {
    if (game.phase === 'finished') return;
    const timer = window.setInterval(() => setNow(Date.now() + serverClockOffsetMs), 250);
    return () => window.clearInterval(timer);
  }, [game.phase, serverClockOffsetMs]);

  // 骰子动画：点数变化时摇 850ms 再落定（纯本地展示，不影响权威时间）。
  const rollKey = useMemo(() => `${game.lastRoll?.seat ?? 'x'}:${game.lastRoll?.dice ?? 0}`, [game.lastRoll]);
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (!game.lastRoll) return;
    setRolling(true);
    const timer = window.setTimeout(() => setRolling(false), 850);
    return () => window.clearTimeout(timer);
  }, [rollKey, game.lastRoll]);

  const deadline = game.rollDeadlineAt ?? game.moveDeadlineAt;
  const secondsLeft = deadline !== null ? Math.max(0, Math.ceil((deadline - now) / 1_000)) : null;
  const turnPlayerId = game.seat !== null ? game.seats[game.seat] : undefined;
  const turnPlayer = turnPlayerId !== undefined ? players.find((player) => player.id === turnPlayerId) : undefined;
  const movablePlanes = game.movablePlanes;

  const rollDice = () => {
    if (!isMyTurn || game.stage !== 'roll' || pending) return;
    onAction({ type: 'roll-dice' });
  };

  const movePlane = (plane: number) => {
    if (!isMyTurn || game.stage !== 'move' || pending) return;
    if (!movablePlanes.includes(plane)) return;
    onAction({ type: 'move-plane', plane });
  };

  // SVG 棋盘回传全局编号，换算为「我的第 N 架」再提交。
  const movePlaneByGlobalId = (globalId: number) => movePlane(globalId - mySeat * 4);

  return (
    <main className="bt-shell bt-ludo">
      <header className="bt-topbar">
        <span className="bt-game-title"><Dices size={18} />飞行棋</span>
        <div className="ld-standings" aria-label="进度">
          {game.seats.map((seatPlayerId, seat) => {
            const player = players.find((entry) => entry.id === seatPlayerId);
            const ranking = game.rankings.find((entry) => entry.playerId === seatPlayerId);
            return (
              <span key={seatPlayerId} className={`${game.seat === seat ? 'is-turn' : ''} ${seatPlayerId === playerId ? 'is-own' : ''}`}>
                <i className="ld-seat-dot" style={{ background: LUDO_SEAT_COLORS[seat] }} />
                {player?.nickname ?? '已离座'} · {ranking?.planesHome ?? 0}/4
              </span>
            );
          })}
        </div>
      </header>

      <section className="bt-stage" aria-label="飞行棋棋盘">
        <div className="ld-board-host">
          <LudoBoard game={game} players={players} playerId={playerId} onMovePlane={movePlaneByGlobalId} />
        </div>

        {game.phase === 'playing' && (
          <>
            <div className={`bt-status ${isMyTurn ? 'is-my-turn' : ''}`} role="status">
              <span
                className={`ld-dice ${rolling ? 'is-rolling' : ''}`}
                data-pips={game.lastRoll?.dice ?? 0}
                aria-label={game.lastRoll ? `骰子 ${game.lastRoll.dice} 点` : '骰子待掷'}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((pip) => (
                  <i key={pip} className="ld-dice-pip" />
                ))}
              </span>
              {isMyTurn
                ? (game.stage === 'roll'
                  ? <>轮到你了 · 掷骰子 · {secondsLeft ?? '—'} 秒</>
                  : <>掷出 {game.dice} 点 · 选择一架飞机 · {secondsLeft ?? '—'} 秒</>)
                : <>等待 {turnPlayer?.nickname ?? '…'} 行动{game.lastRoll ? ` · 刚掷出 ${game.lastRoll.dice} 点` : ''}</>}
              {game.blocked && <em className="ld-blocked">· 本轮无棋可动，自动轮空</em>}
              {game.sixStreak > 0 && !game.blocked && <em className="ld-six">· 连续 6 点 ×{game.sixStreak}</em>}
            </div>
            {isMyTurn && game.stage === 'roll' && (
              <div className="bt-action-dock">
                <button className="bt-primary-button ld-roll-button" type="button" disabled={pending} onClick={rollDice}>
                  <Dices size={20} />掷骰子
                </button>
              </div>
            )}
            {isMyTurn && game.stage === 'move' && movablePlanes.length > 0 && (
              <div className="bt-action-dock ld-move-dock" role="group" aria-label="选择要移动的飞机">
                {movablePlanes.map((planeIndex) => (
                  <button
                    key={planeIndex}
                    type="button"
                    className="ld-move-button"
                    style={{ borderColor: LUDO_SEAT_COLORS[mySeat >= 0 ? mySeat : 0] }}
                    disabled={pending}
                    onClick={() => movePlane(planeIndex)}
                  >
                    {planeIndex + 1} 号机起飞
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {game.phase === 'finished' && (
          <section className="bt-overlay" aria-label="对局结束">
            <h2><Crown size={22} />{game.winnerId ? `${playerNameOf(room.players, game.winnerId)} 的机队全部到家！` : '比赛结束'}</h2>
            <ol className="ld-ranking">
              {game.rankings.map((entry, index) => (
                <li key={entry.playerId} className={entry.playerId === playerId ? 'is-own' : ''}>
                  第 {index + 1} 名 · {playerNameOf(room.players, entry.playerId)} · 到家 {entry.planesHome} 架
                </li>
              ))}
            </ol>
            <div className="bt-overlay-actions">
              {isOwner && <button className="bt-primary-button" type="button" disabled={pending} onClick={() => onAction({ type: 'play-again' })}><RotateCcw size={16} />再来一局</button>}
              {isOwner && <button className="bt-ghost-button" type="button" disabled={pending} onClick={onEndGame}>换个游戏</button>}
              {!isOwner && <p className="bt-waiting">等房主决定下一局</p>}
            </div>
          </section>
        )}
      </section>
      <div className="sr-only" role="status">
        {game.phase === 'playing'
          ? `轮到 ${turnPlayer?.nickname ?? ''}${game.lastRoll ? `，刚掷出 ${game.lastRoll.dice} 点` : ''}`
          : '比赛结束'}
      </div>
    </main>
  );
}
