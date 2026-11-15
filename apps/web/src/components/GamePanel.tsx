import { useEffect, useState } from 'react';
import { ArrowRight, Check, Crown, PartyPopper, RotateCcw, Timer, Trophy, Users } from 'lucide-react';
import type { GameAction, RoomView } from '@party/protocol';
import type { MostLikelyView } from '../types';
import { Brand } from './Brand';

interface GamePanelProps {
  room: RoomView;
  playerId: string;
  onAction: (action: GameAction) => void;
  pending: boolean;
}

export function GamePanel({ room, playerId, onAction, pending }: GamePanelProps) {
  const game = room.game as MostLikelyView;
  const [now, setNow] = useState(Date.now());
  const isOwner = room.ownerId === playerId;
  const participantCount = Object.keys(game.scores).length;

  useEffect(() => {
    if (game.phase !== 'voting') return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [game.phase, game.round]);

  const secondsLeft = game.deadlineAt ? Math.max(0, Math.ceil((game.deadlineAt - now) / 1_000)) : 0;
  const playerName = (id: string) => room.players.find((player) => player.id === id)?.nickname ?? '离场的朋友';
  const playerAvatar = (id: string) => room.players.find((player) => player.id === id)?.avatar ?? '👋';

  return (
    <main className="room-shell game-shell">
      <header className="room-topbar game-topbar">
        <Brand compact />
        <div className="round-status">
          <span>ROUND {String(game.round).padStart(2, '0')}</span>
          <i />
          <span>{game.totalRounds} 轮</span>
        </div>
        <div className="game-score-chip"><Trophy size={16} />{game.scores[playerId] ?? 0} 分</div>
      </header>

      <div className="round-progress"><span style={{ width: `${(game.round / game.totalRounds) * 100}%` }} /></div>

      {game.phase === 'voting' && (
        <section className="voting-stage">
          <div className="question-block">
            <div className={`countdown ${secondsLeft <= 10 ? 'is-urgent' : ''}`}><Timer size={18} /><strong>{secondsLeft}</strong><span>秒</span></div>
            <span className="eyebrow">本轮默契题</span>
            <h1>{game.prompt}</h1>
            <p>别思考太久，第一反应通常最准。</p>
          </div>

          <div className="vote-heading">
            <h2>{game.ownVote ? '已选好，也可以改票' : '你的这一票，投给谁？'}</h2>
            <span><Users size={16} />{game.submittedPlayerIds.length} / {participantCount} 已投票</span>
          </div>
          <div className="vote-grid">
            {room.players.filter((player) => player.role === 'player' && player.id !== playerId).map((player) => {
              const selected = game.ownVote === player.id;
              const submitted = game.submittedPlayerIds.includes(player.id);
              return (
                <button
                  className={`vote-card ${selected ? 'is-selected' : ''}`}
                  type="button"
                  key={player.id}
                  aria-label={`投给 ${player.nickname}`}
                  onClick={() => onAction({ type: 'cast-vote', targetId: player.id })}
                  disabled={pending}
                >
                  <span className="vote-card__avatar">{player.avatar}</span>
                  <strong>{player.nickname}</strong>
                  <span className="vote-card__status">
                    {selected ? <><Check size={15} />我的选择</> : submitted ? <><Check size={14} />已投票</> : player.connected ? '等待投票' : '暂时离线'}
                  </span>
                  <span className="vote-card__circle">{selected ? <Check size={18} /> : <ArrowRight size={17} />}</span>
                </button>
              );
            })}
          </div>
          {playerId && !Object.hasOwn(game.scores, playerId) && <p className="spectator-note">你正在围观，下一局就能加入投票。</p>}
          <p className="privacy-note">投票秘密进行，揭晓前朋友看不到你的选择。</p>
        </section>
      )}

      {game.phase === 'results' && game.results && (
        <section className="results-stage">
          <div className="eyebrow"><PartyPopper size={17} />本轮揭晓</div>
          <div className="focus-card">
            <span className="focus-card__label"><Crown size={18} />全场焦点</span>
            <div className="focus-card__avatars">
              {game.results.winners.length > 0 ? game.results.winners.map((id) => <span key={id}>{playerAvatar(id)}</span>) : <span>🌫️</span>}
            </div>
            <h1>{game.results.winners.length > 0 ? game.results.winners.map(playerName).join(' & ') : '本轮无人得票'}</h1>
            <p>{game.results.winners.length > 1 ? '默契并列，一起加分！' : game.results.winners.length === 1 ? '恭喜获得本轮 1 分' : '下一轮，大胆投出你的第一反应'}</p>
          </div>

          <div className="tally-list">
            {room.players.filter((player) => Object.hasOwn(game.scores, player.id)).map((player) => {
              const count = game.results?.counts[player.id] ?? 0;
              const voters = Object.entries(game.results?.votes ?? {}).filter(([, target]) => target === player.id).map(([voter]) => playerName(voter));
              return (
                <div className={`tally-row ${game.results?.winners.includes(player.id) ? 'is-winner' : ''}`} key={player.id}>
                  <span className="tally-row__avatar">{player.avatar}</span>
                  <div className="tally-row__main">
                    <div><strong>{player.nickname}</strong><span>{voters.length ? `${voters.join('、')} 投的` : '暂时无人投票'}</span></div>
                    <div className="tally-row__bar"><span style={{ width: `${Math.min(100, count / participantCount * 100)}%` }} /></div>
                  </div>
                  <strong className="tally-row__count">{count} 票</strong>
                </div>
              );
            })}
          </div>

          {isOwner ? (
            <button className="primary-button next-round-button" type="button" onClick={() => onAction({ type: 'next-round' })} disabled={pending}>
              {game.round === game.totalRounds ? '查看最终结果' : '下一轮'}<ArrowRight size={20} />
            </button>
          ) : <p className="waiting-owner waiting-owner--dark">等房主进入下一轮…</p>}
        </section>
      )}

      {game.phase === 'finished' && (
        <section className="final-stage">
          <span className="final-stage__trophy"><Trophy size={42} /></span>
          <div className="eyebrow">FINAL RESULTS</div>
          <h1>今晚的气氛担当</h1>
          <div className="champion-avatar">{game.winners.length ? game.winners.map(playerAvatar).join('') : '🎉'}</div>
          <h2>{game.winners.length ? game.winners.map(playerName).join(' & ') : '每一位朋友'}</h2>
          <p>{game.winners.length ? `${Math.max(...Object.values(game.scores))} 分，荣获全场最“十有八九”称号` : '聚在一起，就是今晚最好的答案'}</p>
          <div className="final-ranking">
            {[...room.players].filter((player) => Object.hasOwn(game.scores, player.id)).sort((a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0)).map((player, index) => (
              <div className="final-ranking__row" key={player.id}>
                <span className="ranking-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{player.avatar}</span><strong>{player.nickname}</strong>
                <strong>{game.scores[player.id]} 分</strong>
              </div>
            ))}
          </div>
          {isOwner ? (
            <button className="primary-button next-round-button" type="button" onClick={() => onAction({ type: 'play-again' })} disabled={pending}>
              <RotateCcw size={19} />再来一局
            </button>
          ) : <p className="waiting-owner waiting-owner--dark">想再来一局？催催房主。</p>}
        </section>
      )}
    </main>
  );
}
