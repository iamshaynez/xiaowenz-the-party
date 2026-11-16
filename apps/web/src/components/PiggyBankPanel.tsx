import { useEffect, useState } from 'react';
import { Coins, Hammer, PartyPopper, RotateCcw, Shield, Timer, Users } from 'lucide-react';
import type { PiggyBankView } from '../types';
import { Brand } from './Brand';
import { playerAvatarOf, playerNameOf } from './playerDisplay';
import type { GamePanelProps } from './MostLikelyPanel';

const EVENT_LABELS: Record<string, string> = {
  rain: '💰 金币雨 · 罐子额外多攒 2 枚/人',
  hot: '🔥 烫手罐 · 这轮砸罐只能拿走一半',
  blind: '🌀 盲罐轮 · 黑暗中投币，罐里金额保密',
};

export function PiggyBankPanel({ room, playerId, onAction, pending }: GamePanelProps) {
  const game = room.game as PiggyBankView;
  const [now, setNow] = useState(Date.now());
  const isOwner = room.ownerId === playerId;
  const isParticipant = Object.hasOwn(game.coins, playerId);
  const holderCount = Object.values(game.hammers).filter((count) => count > 0).length;
  const playerName = (id: string) => playerNameOf(room.players, id);
  const playerAvatar = (id: string) => playerAvatarOf(room.players, id);
  const last = game.lastRound;

  useEffect(() => {
    if (game.phase === 'finished') return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [game.phase, game.round]);

  const secondsLeft = game.deadlineAt ? Math.max(0, Math.ceil((game.deadlineAt - now) / 1_000)) : 0;
  const takeable = game.pot === null ? '?' : game.event === 'hot' ? Math.floor(game.pot / 2) : game.pot;

  return (
    <main className="room-shell game-shell">
      <header className="room-topbar game-topbar">
        <Brand compact />
        <div className="round-status">
          <span>第 {game.round} 轮</span>
          <i />
          <span>{game.roundsRange[0]}~{game.roundsRange[1]} 轮间随时落幕</span>
        </div>
        <div className="game-score-chip"><Coins size={16} />{game.coins[playerId] ?? 0} 金币</div>
      </header>

      <div className="round-progress"><span style={{ width: `${(game.round / game.roundsRange[1]) * 100}%` }} /></div>

      {game.phase === 'choosing' && (
        <section className="pb-stage pb-choosing">
          <div className="pb-jar-block">
            <div className={`countdown ${secondsLeft <= 10 ? 'is-urgent' : ''}`}><Timer size={18} /><strong>{secondsLeft}</strong><span>秒</span></div>
            <span className="eyebrow"><Hammer size={15} />守罐还是发财？</span>
            <div className={`pb-jar ${game.event === 'blind' ? 'is-blind' : ''}`}>
              <span className="pb-jar__emoji">🏺</span>
              <strong className="pb-jar__amount">{game.pot === null ? '？' : game.pot}</strong>
              <span className="pb-jar__unit">{game.pot === null ? '金额保密' : '枚金币'}</span>
            </div>
            {game.event && <div className="pb-event">{EVENT_LABELS[game.event]}</div>}
            <p className="pb-jar-hint">砸罐的人平分罐中金币；全员守护就一起攒更大的。</p>
          </div>

          <div className="vote-heading">
            <h2>{game.ownChoice ? '已记下，揭晓前可以反悔' : '这一轮，你怎么选？'}</h2>
            <span><Users size={16} />{game.submittedPlayerIds.length} / {holderCount} 已决定</span>
          </div>

          {isParticipant && game.ownHammers > 0 && (
            <div className="pb-choices">
              <button
                type="button"
                className={`pb-choice pb-choice--guard ${game.ownChoice === 'guard' ? 'is-selected' : ''}`}
                aria-label="守护罐子"
                onClick={() => onAction({ type: 'choose', choice: 'guard' })}
                disabled={pending}
              >
                <Shield size={22} />
                <strong>守护</strong>
                <span>看着罐子继续长大</span>
              </button>
              <button
                type="button"
                className={`pb-choice pb-choice--smash ${game.ownChoice === 'smash' ? 'is-selected' : ''}`}
                aria-label={`打破罐子拿走 ${takeable} 枚`}
                onClick={() => onAction({ type: 'choose', choice: 'smash' })}
                disabled={pending}
              >
                <Hammer size={22} />
                <strong>砸罐</strong>
                <span>现在能拿 {takeable} 枚</span>
              </button>
            </div>
          )}
          {isParticipant && game.ownHammers === 0 && (
            <p className="pb-no-hammer">🔨 你的锤子用完了，这几轮自动守护，坐等终局平分。</p>
          )}
          {!isParticipant && <p className="spectator-note">你正在围观，下一局就能加入守罐大战。</p>}
          <p className="pb-hammer-count">你还有 {game.ownHammers} 把锤子 · 全场还剩 {holderCount} 把</p>
          <p className="privacy-note">砸与不砸秘密进行，揭晓那一刻才见分晓。</p>
        </section>
      )}

      {game.phase === 'reveal' && last && (
        <section className="pb-stage pb-reveal">
          <div className="eyebrow"><PartyPopper size={17} />本轮揭晓</div>
          <div className={`pb-outcome ${last.event === 'paper' || last.event === 'alarm' ? 'pb-outcome--twist' : ''}`}>
            <span className="pb-outcome__label">{outcomeLabel(last, playerName)}</span>
            <h1>{outcomeHeadline(last, playerName)}</h1>
            <p>{outcomeDetail(last)}</p>
          </div>

          <div className="tally-list">
            {room.players.filter((player) => Object.hasOwn(game.coins, player.id)).map((player) => {
              const payout = last.payouts[player.id] ?? 0;
              const smashed = last.smashers.includes(player.id);
              return (
                <div className={`tally-row ${payout > 0 ? 'is-winner' : ''}`} key={player.id}>
                  <span className="tally-row__avatar">{player.avatar}</span>
                  <div className="tally-row__main">
                    <div>
                      <strong>{player.nickname}</strong>
                      <span>{smashed ? '🔨 砸了罐子' : (game.hammers[player.id] ?? 0) > 0 ? '持锤守护' : '自动守护'}</span>
                    </div>
                  </div>
                  <strong className="tally-row__count">{payout > 0 ? `+${payout}` : '+0'}</strong>
                </div>
              );
            })}
          </div>

          <p className="pb-pot-line">罐子 {last.potBefore} → <strong>{last.potAfter}</strong> 枚{last.blindBonus > 0 ? ` · 盲罐里其实多塞了 ${last.blindBonus} 枚` : ''}</p>
          <p className="waiting-owner waiting-owner--dark pb-next-hint">下一轮 {secondsLeft} 秒后开始…</p>
        </section>
      )}

      {game.phase === 'finished' && (
        <section className="final-stage">
          <span className="final-stage__trophy"><Coins size={42} /></span>
          <div className="eyebrow">FINAL RESULTS</div>
          <h1>今晚的存钱罐之王</h1>
          <div className="champion-avatar">{game.winners.length ? game.winners.map(playerAvatar).join('') : '🏺'}</div>
          <h2>{game.winners.length ? game.winners.map(playerName).join(' & ') : '每一位朋友'}</h2>
          <p>{game.finalSplit > 0 ? `终局信任加成：剩下的罐子每人分得 ${game.finalSplit} 枚` : '罐子已经见了底，信任才是真财富'}</p>
          <div className="final-ranking">
            {[...room.players].filter((player) => Object.hasOwn(game.coins, player.id)).sort((a, b) => (game.coins[b.id] ?? 0) - (game.coins[a.id] ?? 0)).map((player, index) => (
              <div className="final-ranking__row" key={player.id}>
                <span className="ranking-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{player.avatar}</span><strong>{player.nickname}</strong>
                <strong>{game.coins[player.id]} 金币</strong>
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

function outcomeLabel(last: NonNullable<PiggyBankView['lastRound']>, playerName: (id: string) => string) {
  if (last.event === 'paper') return '🃏 纸糊罐！';
  if (last.event === 'alarm') return '🚨 警报轮！';
  if (last.event === 'hot') return '🔥 烫手罐';
  if (last.event === 'rain') return '💰 金币雨';
  if (last.event === 'blind') return '🌀 盲罐揭晓';
  if (last.smashers.length > 0) return '🔨 罐子碎了';
  return '🛡️ 全员守护';
}

function outcomeHeadline(last: NonNullable<PiggyBankView['lastRound']>, playerName: (id: string) => string) {
  const names = last.smashers.map(playerName).join('、');
  if (last.event === 'paper' && last.smashers.length > 0) return `${names} 砸了个寂寞`;
  if (last.event === 'paper') return '还好没人手痒';
  if (last.event === 'alarm' && last.smashers.length === 1) return `${names} 触发了警报`;
  if (last.event === 'alarm') return `${names} 一起砸开了罐子`;
  if (last.smashers.length === 1) return `${names} 把罐子端走了`;
  if (last.smashers.length > 1) return `${names} 平分了罐子`;
  return '罐子毫发无损，继续长大';
}

function outcomeDetail(last: NonNullable<PiggyBankView['lastRound']>) {
  if (last.event === 'paper' && last.smashers.length > 0) return '锤子没了，金币没拿到，真罐还好好的';
  if (last.event === 'alarm' && last.smashers.length === 1) return '独狼砸罐一无所获，罐子平分给了所有守护者';
  if (last.event === 'hot' && last.smashers.length > 0) return '烫手罐只许拿走一半，另一半继续留在罐里';
  if (last.event === 'blind') return `黑暗里塞进去的钱揭晓：${last.blindBonus} 枚`;
  if (last.smashers.length > 0) return '守罐的人各得一枚安慰币';
  return '所有人都在憋大招';
}
