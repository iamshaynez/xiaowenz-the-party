import { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, RotateCcw, Swords } from 'lucide-react';
import type { GameAction } from '@party/protocol';
import { GOMOKU_BOARD_SIZE } from '@party/protocol';
import type { GomokuView } from '@party/games';
import { playerAvatarOf, playerNameOf } from '../playerDisplay';
import type { GamePanelProps } from '../gamePanelTypes';
import { GomokuCanvas } from './GomokuCanvas';
import type { GomokuPlayers } from './GomokuScene';

// 五子棋面板：3D 木棋盘为主舞台，回合与比分在 DOM 里保持可达性。
export function GomokuPanel({ room, playerId, onAction, onEndGame, pending, serverClockOffsetMs = 0 }: GamePanelProps) {
  const game = room.game as GomokuView;
  const isOwner = room.ownerId === playerId;
  const players: GomokuPlayers[] = room.players.map((player) => ({ id: player.id, nickname: player.nickname, avatar: player.avatar }));
  const seatOf = (id: string) => game.blackSeat === players.findIndex((player) => player.id === id) ? '执黑' : '执白';
  const mySeat = players.findIndex((player) => player.id === playerId);
  const myColor: 0 | 1 = mySeat >= 0 && mySeat === game.blackSeat ? 0 : 1;
  const turnPlayerId = game.turnSeat !== null && game.turnSeat < players.length ? players[game.turnSeat]!.id : null;
  const canPlace = game.phase === 'playing' && turnPlayerId === playerId;
  const [webglFailed, setWebglFailed] = useState(false);
  const handleRenderFailure = useCallback(() => setWebglFailed(true), []);
  const [now, setNow] = useState(Date.now() + serverClockOffsetMs);
  const lastBoardRef = useRef('');

  useEffect(() => {
    if (game.phase === 'finished') return;
    const timer = window.setInterval(() => setNow(Date.now() + serverClockOffsetMs), 250);
    return () => window.clearInterval(timer);
  }, [game.phase, serverClockOffsetMs]);

  // 每换一盘清一次本地状态，避免旧棋盘的悬停残留。
  useEffect(() => {
    const signature = `${game.round}:${game.totalRounds}`;
    if (lastBoardRef.current !== signature) lastBoardRef.current = signature;
  }, [game.round, game.totalRounds]);

  const place = (x: number, y: number) => {
    if (!canPlace || pending) return;
    onAction({ type: 'place-stone', x, y } satisfies GameAction);
  };

  const secondsLeft = game.deadlineAt !== null
    ? Math.max(0, Math.ceil((game.deadlineAt - now) / 1_000))
    : null;
  const roundEndsIn = game.roundEndsAt !== null ? Math.max(0, Math.ceil((game.roundEndsAt - now) / 1_000)) : null;
  const blackId = players[game.blackSeat]?.id ?? '';
  const whiteId = players.find((player) => player.id !== blackId)?.id ?? '';

  return (
    <main className="bt-shell bt-gomoku">
      <header className="bt-topbar">
        <span className="bt-game-title"><Swords size={18} />五子棋 · 第 {game.round} / {game.totalRounds} 盘</span>
        <div className="gm-scoreboard" aria-label="比分">
          <span className={blackId === playerId ? 'is-own' : ''}>
            <i className="gm-stone-dot gm-stone-black" />{playerNameOf(room.players, blackId)} · 执黑 · {game.scores[blackId] ?? 0}
          </span>
          <span className="gm-score-sep">vs</span>
          <span className={whiteId === playerId ? 'is-own' : ''}>
            <i className="gm-stone-dot gm-stone-white" />{playerNameOf(room.players, whiteId)} · 执白 · {game.scores[whiteId] ?? 0}
          </span>
        </div>
      </header>

      <section className="bt-stage" aria-label="五子棋棋盘">
        {!webglFailed ? (
          <GomokuCanvas
            game={game}
            players={players}
            playerId={playerId}
            canPlace={canPlace && !pending}
            onPlace={place}
            onFailure={handleRenderFailure}
          />
        ) : (
          <div className="gm-dom-board" role="grid" aria-label="五子棋棋盘（文字模式）">
            {Array.from({ length: GOMOKU_BOARD_SIZE }).map((_, y) => (
              <div className="gm-dom-row" role="row" key={y}>
                {Array.from({ length: GOMOKU_BOARD_SIZE }).map((_, x) => {
                  const cell = game.board[y * GOMOKU_BOARD_SIZE + x];
                  const isLast = game.lastMove?.x === x && game.lastMove?.y === y;
                  const inWin = game.winLine?.some((point) => point.x === x && point.y === y) ?? false;
                  return (
                    <button
                      key={x}
                      type="button"
                      role="gridcell"
                      className={`gm-dom-cell ${cell === 0 ? 'is-black' : ''} ${cell === 1 ? 'is-white' : ''} ${inWin ? 'is-win' : ''}`}
                      aria-label={`第 ${y + 1} 行第 ${x + 1} 列${cell === null ? '空位' : cell === 0 ? '黑子' : '白子'}${isLast ? '，最新落子' : ''}`}
                      disabled={!canPlace || cell !== null || pending}
                      onClick={() => place(x, y)}
                    >{isLast ? '◉' : ''}</button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {game.phase === 'playing' && (
          <div className={`bt-status ${turnPlayerId === playerId ? 'is-my-turn' : ''}`} role="status">
            {turnPlayerId === playerId
              ? <>轮到你了 · 执{myColor === 0 ? '黑' : '白'} · {secondsLeft ?? '—'} 秒</>
              : <>等待 {playerNameOf(room.players, turnPlayerId ?? '')} 落子 · {secondsLeft ?? '—'} 秒</>}
          </div>
        )}

        {game.phase === 'round-end' && (
          <section className="bt-overlay" aria-label="本盘结果">
            <h2><Crown size={22} />{game.boardWinnerId ? `${playerNameOf(room.players, game.boardWinnerId)} 拿下本盘` : '平局'}</h2>
            <p>{roundEndsIn} 秒后开始下一盘{isOwner ? '，也可以现在继续' : ''}</p>
            {isOwner && <button className="bt-primary-button" type="button" disabled={pending} onClick={() => onAction({ type: 'next-board' })}>下一盘</button>}
          </section>
        )}

        {game.phase === 'finished' && (
          <section className="bt-overlay" aria-label="对局结束">
            <h2><Crown size={22} />{game.winners.length > 0 ? `${game.winners.map((id) => playerNameOf(room.players, id)).join('、')} 获胜` : '平分秋色'}</h2>
            <p>最终比分 {game.scores[blackId] ?? 0} : {game.scores[whiteId] ?? 0}</p>
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
          ? `当前轮到 ${playerNameOf(room.players, turnPlayerId ?? '')}${game.lastMove ? `，最新落子在第 ${game.lastMove.y + 1} 行第 ${game.lastMove.x + 1} 列` : ''}`
          : '本盘已结束'}
      </div>
      <span className="sr-only">{playerAvatarOf(room.players, blackId)} 执黑先行</span>
    </main>
  );
}
